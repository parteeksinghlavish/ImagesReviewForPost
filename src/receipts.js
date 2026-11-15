// Reconcile private n8n scheduling receipts to D1. No Postiz or Instagram calls.
const CHANNEL_ID = "cmwakcjhq0001r46r8j756ym8";
const ID_RE = /^[A-Za-z0-9_-]{8,80}-[0-3]$/;
const POST_RE = /^[A-Za-z0-9_-]{6,150}$/;
const RECEIPT_RE = /^review\/receipts\/([A-Za-z0-9_-]{8,80}-[0-3])\.json$/;

export async function reconcilePostizReceipts(env, maxItems=50) {
  const counts={scheduled:0, already_synced:0, invalid:0, conflicts:0, deleted_manifests:0};
  const list=await env.PENDING.list({prefix:"review/receipts/",limit:1000});
  const objects=(list.objects||[]).filter(o=>RECEIPT_RE.test(o.key)).slice(0,maxItems);
  for(const file of objects){
    let payload;
    try{
      const item=await env.PENDING.get(file.key);
      if(!item)continue;
      const raw=await new Response(item.body).text();
      if(raw.length>4000)throw Error("Receipt too large");
      payload=JSON.parse(raw);
      if(payload.version!==1||payload.status!=="scheduled"||
         payload.integration_id!==CHANNEL_ID||payload.profile!=="discoverxploration"||
         payload.platform!=="instagram"||payload.kind!=="single_image"||
         !ID_RE.test(String(payload.image_id||""))||!POST_RE.test(String(payload.postiz_post_id||""))||
         file.key!=="review/receipts/"+payload.image_id+".json"||
         !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(String(payload.publish_at||"")))
        throw Error("Invalid account, image or schedule receipt");
    }catch(e){
      counts.invalid++;
      console.error("Invalid private Postiz receipt",String(e).slice(0,100));
      continue;
    }
    const row=await env.DB.prepare(
      "SELECT j.status,j.publish_at,j.postiz_post_id,i.status AS image_status FROM publication_jobs j "+
      "JOIN image_reviews i ON i.id=j.image_id WHERE j.image_id=?"
    ).bind(payload.image_id).first();
    if(!row||row.publish_at!==payload.publish_at){counts.conflicts++;continue}
    if(row.status==="scheduled"&&row.postiz_post_id===payload.postiz_post_id){counts.already_synced++;continue}
    if(row.status!=="held"||row.postiz_post_id||row.image_status!=="approved"){counts.conflicts++;continue}
    const batches=await env.DB.batch([
      env.DB.prepare(
        "UPDATE publication_jobs SET status='scheduled',postiz_post_id=?,provider_status='QUEUE',"+
        "last_error=NULL,last_checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),"+
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
        "WHERE image_id=? AND status='held' AND postiz_post_id IS NULL AND publish_at=? RETURNING image_id"
      ).bind(payload.postiz_post_id,payload.image_id,payload.publish_at),
      env.DB.prepare(
        "UPDATE image_reviews SET status='scheduled',scheduled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),"+
        "postiz_post_id=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
        "WHERE id=? AND status='approved' RETURNING id"
      ).bind(payload.postiz_post_id,payload.image_id),
      env.DB.prepare("INSERT INTO review_events(image_id,event,detail) VALUES(?,?,?)")
        .bind(payload.image_id,"postiz_scheduled","Verified DiscoverXploration single image: "+payload.postiz_post_id)
    ]);
    if(batches[0]?.results?.length===1 && batches[1]?.results?.length===1){
      counts.scheduled++;
      try{
        await env.PENDING.delete("review/held/"+payload.image_id+".json");
        counts.deleted_manifests++;
      }catch(e){console.error("Held manifest cleanup pending",String(e).slice(0,100))}
    }else counts.conflicts++;
  }
  return counts;
}
