// Held-slot management only. No Postiz or Instagram network calls.
import { LIVE_POSTING_ENABLED } from "./queue.js";
import { heldManifestKey, writeHeldManifest } from "./manifest.js";

const ID=/^[A-Za-z0-9_-]{8,80}-[0-3]$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const nowSQL="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
function conflict(message){return Object.assign(new Error(message),{status:409});}
function invalid(message){return Object.assign(new Error(message),{status:400});}
export function validateSlot(value, now=new Date()){
  if(typeof value!=="string"||!ISO.test(value))throw invalid("Schedule must be a UTC ISO timestamp with whole seconds");
  const time=Date.parse(value);
  if(!Number.isFinite(time)||new Date(time).toISOString().replace(".000Z","Z")!==value)
    throw invalid("Invalid calendar date");
  const delta=time-now.getTime();
  if(delta<60*60*1000)throw invalid("Choose a time at least one hour from now");
  if(delta>90*86400000)throw invalid("Schedule must be within the next 90 days");
  return value;
}
export function monthBoundsIST(month) {
 if(typeof month!=="string"||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw invalid("Calendar month must be YYYY-MM");
 const [year,m]=month.split("-").map(Number);
 // Midnight in India (UTC+05:30) for the first day of each month.
 const start=new Date(Date.UTC(year,m-1,1)-330*60*1000).toISOString().replace(".000Z","Z");
 const end=new Date(Date.UTC(year,m,1)-330*60*1000).toISOString().replace(".000Z","Z");
 return {start,end,month,timezone:"Asia/Kolkata"};
}
export async function listCalendar(env,month){
 const bounds=monthBoundsIST(month);
 const rows=await env.DB.prepare(`SELECT j.image_id,j.publish_at,j.status AS publication_state,i.image_index,i.batch_id,i.object_key,d.status AS simulation_state
   FROM publication_jobs j JOIN image_reviews i ON i.id=j.image_id
   LEFT JOIN publication_simulations d ON d.image_id=j.image_id
   WHERE j.status='held' AND i.status='approved' AND j.publish_at>=? AND j.publish_at<?
   ORDER BY j.publish_at ASC LIMIT 500`).bind(bounds.start,bounds.end).all();
 return {month,timezone:bounds.timezone,items:rows.results||[],publishing_enabled:false,kind:"held_plans_only"};
}
export async function manageHeldSlot(env,{id,action,publish_at,expected_at}={}){
 if(LIVE_POSTING_ENABLED)throw conflict("Held-slot management requires publishing to be paused");
 if(typeof id!=="string"||!ID.test(id))throw invalid("Invalid image ID");
 if(!["cancel","reschedule","restore"].includes(action))throw invalid("Unknown schedule action");
 const job=await env.DB.prepare(`SELECT j.image_id,j.status,j.publish_at,j.postiz_post_id,i.status AS review_status
   FROM publication_jobs j JOIN image_reviews i ON i.id=j.image_id WHERE j.image_id=?`).bind(id).first();
 if(!job||job.review_status!=="approved"||job.postiz_post_id)throw conflict("Only approved images without a real Postiz post can change their held slot");
 if(action==="cancel"){
  if(job.status==="cancelled")return {id,status:"cancelled",duplicate:true,publishing_enabled:false};
  if(job.status!=="held")throw conflict("Only a held slot can be cancelled");
 }else{
  if(action==="restore"&&job.status!=="cancelled")throw conflict("Only a cancelled hold can be restored");
  if(action==="reschedule"&&job.status!=="held")throw conflict("Only an active hold can be rescheduled");
  validateSlot(publish_at);
 }
 if(expected_at!==undefined&&expected_at!==job.publish_at)throw conflict("Schedule changed since this card was loaded; refresh");
 if(action==="reschedule"&&publish_at===job.publish_at)return {id,status:"held",planned_at:job.publish_at,duplicate:true,publishing_enabled:false};
 try {
  let row;
  if(action==="cancel"){
   row=await env.DB.prepare(`UPDATE publication_jobs SET status='cancelled',manifest_synced_at=NULL,last_error=NULL,updated_at=${nowSQL}
    WHERE image_id=? AND status='held' AND publish_at=? AND postiz_post_id IS NULL RETURNING image_id,publish_at,status`).bind(id,job.publish_at).first();
  }else{
   // The existing table reserves historical slots with a UNIQUE publish_at column.
   // Canceled slots remain reserved to avoid races and accidental reuse.
   row=await env.DB.prepare(`UPDATE publication_jobs SET status='held',publish_at=?,manifest_synced_at=NULL,
     last_error=NULL,updated_at=${nowSQL}
     WHERE image_id=? AND status=? AND publish_at=? AND postiz_post_id IS NULL RETURNING image_id,publish_at,status`)
     .bind(publish_at,id,job.status,job.publish_at).first();
  }
  if(!row)throw conflict("This slot changed concurrently; refresh");
  // Previous simulated outcomes apply to the old reservation, not the new one.
  await env.DB.prepare("DELETE FROM publication_simulations WHERE image_id=?").bind(id).run();
  await env.DB.prepare("INSERT INTO review_events(image_id,event,detail) VALUES(?,?,?)")
    .bind(id,action==="cancel"?"slot_cancelled":action==="restore"?"slot_restored":"slot_rescheduled",
      action==="cancel"?"Held slot cancelled; Instagram remains off":job.publish_at+" → "+row.publish_at).run();
  if(action==="cancel"){
   try {
    await env.PENDING.delete(heldManifestKey(id));
    return {id,status:"cancelled",manifest_state:"deleted",publishing_enabled:false};
   }catch(e){
    await env.DB.prepare(`UPDATE publication_jobs SET last_error=? WHERE image_id=? AND status='cancelled'`)
      .bind("Manifest cleanup: "+String(e).slice(0,160),id).run();
    return {id,status:"cancelled",manifest_state:"retry_pending",publishing_enabled:false};
   }
  }
  const manifest=await writeHeldManifest(env,id);
  return {id,status:"held",planned_at:row.publish_at,manifest_state:manifest.status,publishing_enabled:false};
 }catch(e){
  if(e?.status)throw e;
  if(/UNIQUE constraint failed|SQLITE_CONSTRAINT|constraint failed/i.test(String(e)))throw conflict("Another image already reserves this time. Choose a different slot.");
  throw e;
 }
}
export async function retryCancelledManifestCleanup(env,limit=25){
 const rows=await env.DB.prepare(`SELECT image_id FROM publication_jobs
 WHERE status='cancelled' AND last_error LIKE 'Manifest cleanup:%' ORDER BY updated_at ASC LIMIT ?`).bind(limit).all();
 let cleaned=0,failed=0;
 for(const x of rows.results||[]){
  try{
   await env.PENDING.delete(heldManifestKey(x.image_id));
   await env.DB.prepare("UPDATE publication_jobs SET last_error=NULL WHERE image_id=? AND status='cancelled'").bind(x.image_id).run();
   cleaned++;
  }catch {failed++;}
 }
 return {cleaned,failed};
}
