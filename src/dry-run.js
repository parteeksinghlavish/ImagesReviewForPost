// Simulation-only Postiz adapter and state tracker.
// No fetch(), API credentials, or Postiz / Instagram side effects exist in this module.
import { prepareSingleImagePost } from "./postiz-plan.js";
import { LIVE_POSTING_ENABLED } from "./queue.js";

const IMAGE_ID = /^[A-Za-z0-9_-]{8,80}-[0-3]$/;
const STATES = new Set(["simulated_scheduled","simulated_published","simulated_failed","simulated_uncertain"]);
const NEXT = Object.freeze({
  simulated_scheduled: new Set(["simulated_published","simulated_failed","simulated_uncertain"]),
  simulated_uncertain: new Set(["simulated_scheduled","simulated_published","simulated_failed"]),
  simulated_published: new Set(),
  simulated_failed: new Set()
});
const CHANNEL = "cmwakcjhq0001r46r8j756ym8";

function problem(message,status=400){return Object.assign(new Error(message),{status});}
function validate(id){if(typeof id!=="string"||!IMAGE_ID.test(id))throw problem("Invalid image ID");}
function response(row,duplicate=false){
  return {image_id:row.image_id,simulation_state:row.status,planned_at:row.publish_at,
    simulated_post_id:row.mock_post_id,simulated_upload_id:row.mock_upload_id,
    duplicate,publishing_enabled:false,real_postiz_request:false};
}
// A transport boundary with deterministic fabricated receipts. Never connects to Postiz.
export function createMockPostizAdapter() {
  return Object.freeze({
    async upload(bytes, id) {
      if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)
        throw problem("Review image is missing or not a JPEG",422);
      return {id:"dryrun_"+id,path:"https://insta.titanrigs.com/dryrun_"+id+".jpg",simulated:true};
    },
    async schedule(plan,id) {
      if(plan.type!=="schedule"||plan.posts.post.length!==1||
         plan.posts.post[0].value.contentItem[0].image.imageItem.length!==1)
        throw problem("Dry-run requires exactly one scheduled single image",422);
      return {postId:"simulated_"+id,status:"simulated_scheduled",simulated:true};
    }
  });
}
export async function prepareDryRun(env,id) {
  validate(id);
  if(LIVE_POSTING_ENABLED)throw problem("Dry-run cannot operate while live publishing is enabled",409);
  const existing=await env.DB.prepare("SELECT * FROM publication_simulations WHERE image_id=?").bind(id).first();
  if(existing)return response(existing,true);
  const row=await env.DB.prepare(`SELECT j.image_id,j.status,j.publish_at,i.object_key,i.status AS review_status
      FROM publication_jobs j JOIN image_reviews i ON i.id=j.image_id WHERE j.image_id=?`).bind(id).first();
  if(!row||row.review_status!=="approved"||row.status!=="held")
    throw problem("Only approved, held images can be dry-run scheduled",409);
  const obj=await env.PENDING.get(row.object_key);
  if(!obj)throw problem("Approved image is missing from private R2 storage",409);
  const bytes=new Uint8Array(await new Response(obj.body).arrayBuffer());
  const adapter=createMockPostizAdapter();
  const receipt=await adapter.upload(bytes,id);
  const plan=prepareSingleImagePost(row,receipt,CHANNEL);
  const scheduled=await adapter.schedule(plan,id);
  // Database uniqueness makes duplicate requests idempotent. No real job is touched.
  const write=await env.DB.prepare(`INSERT OR IGNORE INTO publication_simulations
    (image_id,status,publish_at,mock_upload_id,mock_post_id,payload_json)
    VALUES (?,?,?,?,?,?)`).bind(id,scheduled.status,row.publish_at,receipt.id,scheduled.postId,JSON.stringify(plan)).run();
  if(write.meta?.changes===1){
    await env.DB.prepare("INSERT INTO review_events(image_id,event,detail) VALUES(?,?,?)")
      .bind(id,"dry_run_scheduled","Single-image mock Postiz receipt; no network request").run();
  }
  const saved=await env.DB.prepare("SELECT * FROM publication_simulations WHERE image_id=?").bind(id).first();
  if(!saved)throw problem("Could not persist dry-run result",500);
  return response(saved,write.meta?.changes!==1);
}
export async function reconcileDryRun(env,id,action) {
  validate(id);
  if(LIVE_POSTING_ENABLED)throw problem("Dry-run cannot operate while live publishing is enabled",409);
  const target={published:"simulated_published",failed:"simulated_failed",
    uncertain:"simulated_uncertain",verified_scheduled:"simulated_scheduled"}[action];
  if(!target||!STATES.has(target))throw problem("Unknown simulation result",400);
  const old=await env.DB.prepare("SELECT * FROM publication_simulations WHERE image_id=?").bind(id).first();
  if(!old)throw problem("Prepare the dry-run first",409);
  if(old.status===target)return response(old,true);
  if(!NEXT[old.status]?.has(target))throw problem("Invalid simulation transition; no resend attempted",409);
  const updated=await env.DB.prepare(`UPDATE publication_simulations
      SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE image_id=? AND status=? RETURNING *`).bind(target,id,old.status).first();
  if(!updated)throw problem("Concurrent update; refresh status",409);
  await env.DB.prepare("INSERT INTO review_events(image_id,event,detail) VALUES(?,?,?)")
     .bind(id,"dry_run_"+action,"Simulation status only; held real job unchanged").run();
  return response(updated);
}
export async function dryRunAction(env,id,action){
  if(action==="prepare")return prepareDryRun(env,id);
  return reconcileDryRun(env,id,action);
}
