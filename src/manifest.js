// Authenticated private R2 handoff between swipe approvals and the future n8n publisher.
// These are HELD manifests, never dispatch instructions.
import { LIVE_POSTING_ENABLED } from "./queue.js";
const TARGET_ID="cmwakcjhq0001r46r8j756ym8";
const CONFIG_KEY="review/config/instagram-publishing.json";
export async function getPublishingConfig(env) {
  try {
    const object=await env.PENDING.get(CONFIG_KEY);
    if(!object)return {enabled:false,reason:"missing"};
    const raw=await new Response(object.body).text();
    if(raw.length>2000)return {enabled:false,reason:"invalid_length"};
    const config=JSON.parse(raw);
    if(config.version!==1||config.integration_id!==TARGET_ID||
       config.profile!=="discoverxploration"||config.channel!=="DiscoverXploration"||
       config.cadence_hours!==6||JSON.stringify(config.slots_ist)!=="[0,6,12,18]")
      return {enabled:false,reason:"invalid_target"};
    return {enabled:config.enabled===true,integration_id:TARGET_ID,profile:"discoverxploration",cadence_hours:6};
  }catch(error){
    console.error("Publishing kill-switch read failed",String(error).slice(0,100));
    return {enabled:false,reason:"read_error"};
  }
}


const ID=/^[A-Za-z0-9_-]{8,80}-[0-3]$/;
const REVIEW_KEY=/^review\/pending\/[A-Za-z0-9_-]{8,80}\/[0-3]\.jpg$/;

export function heldManifestKey(id) {
  if (!ID.test(id)) throw new TypeError("Invalid image ID");
  return "review/held/"+id+".json";
}
export function formatHeldManifest(record, enabled=LIVE_POSTING_ENABLED) {
  if(!record || !ID.test(String(record.image_id)) || !REVIEW_KEY.test(String(record.object_key))) throw new TypeError("Invalid approved image");
  if(record.status!=="held" || record.review_status!=="approved") throw new Error("Only approved HELD jobs can create manifests");
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(record.publish_at))throw new TypeError("Invalid UTC slot");
  return {
    version:1,state:"held",image_id:record.image_id,object_key:record.object_key,
    planned_post_at:record.publish_at,kind:"single_image",provider:"postiz",
    platform:"instagram",channel:"DiscoverXploration",integration_id:TARGET_ID,profile:"discoverxploration",
    publishing_enabled:enabled
  };
}

export async function writeHeldManifest(env,id){
  const row=await env.DB.prepare("SELECT j.image_id,j.status,j.publish_at,j.manifest_synced_at,i.object_key,i.status AS review_status FROM publication_jobs j JOIN image_reviews i ON i.id=j.image_id WHERE j.image_id=?").bind(id).first();
  if(!row || row.status!=="held" || row.review_status!=="approved")return {status:"skipped"};
  if(row.manifest_synced_at)return {status:"staged"};
  const active=await getPublishingConfig(env);
  const manifest=formatHeldManifest(row,active.enabled);
  try{
    await env.PENDING.put(heldManifestKey(id),JSON.stringify(manifest),{httpMetadata:{contentType:"application/json"}});
    await env.DB.prepare("UPDATE publication_jobs SET manifest_synced_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_error=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE image_id=? AND status='held'").bind(id).run();
    await env.DB.prepare("INSERT INTO review_events(image_id,event,detail) VALUES(?,?,?)").bind(id,"manifest_staged",active.enabled?"Armed for verified DiscoverXploration only":"Private R2 hold; publishing disabled").run();
    return {status:"staged"};
  }catch(e){
    await env.DB.prepare("UPDATE publication_jobs SET last_error=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE image_id=? AND status='held'").bind(("Manifest staging: "+String(e)).slice(0,250),id).run();
    return {status:"retry_pending"};
  }
}

export async function reconcileHeldManifests(env,limit=30){
  const rows=await env.DB.prepare("SELECT image_id FROM publication_jobs WHERE status='held' AND manifest_synced_at IS NULL ORDER BY created_at ASC LIMIT ?").bind(limit).all();
  const count={staged:0,retry_pending:0,skipped:0};
  for(const row of rows.results||[]){
    const res=await writeHeldManifest(env,row.image_id);
    count[res.status]=(count[res.status]||0)+1;
  }
  return {count,publishing_enabled:LIVE_POSTING_ENABLED};
}
