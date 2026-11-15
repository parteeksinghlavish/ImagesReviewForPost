// Read-only Postiz status reconciliation from an authenticated n8n R2 snapshot.
// Never uploads, schedules, retries, or publishes a post.
const ACCOUNT = "cmwakcjhq0001r46r8j756ym8";
const SNAPSHOT = "review/status/discoverxploration.json";
const ID = /^[A-Za-z0-9_-]{6,150}$/;
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export async function reconcilePostizStatuses(env, maxItems=100){
  const result={published:0,failed:0,still_scheduled:0,ignored:0,stale:false,invalid:false};
  let data;
  try{
    const obj=await env.PENDING.get(SNAPSHOT);
    if(!obj)return result;
    const raw=await new Response(obj.body).text();
    if(raw.length>100000)throw Error("Status snapshot is too large");
    data=JSON.parse(raw);
    const time=Date.parse(data.collected_at);
    if(data.version!==1||data.integration_id!==ACCOUNT||data.profile!=="discoverxploration"||
       !Array.isArray(data.posts)||!Number.isFinite(time))throw Error("Unverified account status snapshot");
    if(time>Date.now()+5*60000||Date.now()-time>6*3600000){result.stale=true;return result}
  }catch(e){
    result.invalid=true;console.error("Could not verify Postiz status snapshot",String(e).slice(0,100));
    return result;
  }
  const dedup=new Map();
  for(const entry of data.posts){
    const postId=String(entry.postiz_post_id||"");
    if(ID.test(postId))dedup.set(postId,entry);
  }
  for(const [postId,item] of [...dedup].slice(0,maxItems)){
    const row=await env.DB.prepare(
      "SELECT j.image_id,j.status,i.status AS image_status FROM publication_jobs j "+
      "JOIN image_reviews i ON i.id=j.image_id WHERE j.postiz_post_id=?"
    ).bind(postId).first();
    if(!row){result.ignored++;continue}
    const state=String(item.provider_state||"").toUpperCase();
    if(row.status!=="scheduled"){result.ignored++;continue}
    if(state==="PUBLISHED"||state==="ERROR"){
      const newState=state==="PUBLISHED"?"published":"failed";
      const newImage=state==="PUBLISHED"?"published":"error";
      const changes=await env.DB.batch([
        env.DB.prepare(
          "UPDATE publication_jobs SET status=?,provider_status=?,last_checked_at="+NOW+","+
          "updated_at="+NOW+" WHERE image_id=? AND status='scheduled' AND postiz_post_id=? RETURNING image_id"
        ).bind(newState,state,row.image_id,postId),
        env.DB.prepare(
          "UPDATE image_reviews SET status=?,updated_at="+NOW+" WHERE id=? AND status='scheduled' RETURNING id"
        ).bind(newImage,row.image_id),
        env.DB.prepare("INSERT INTO review_events(image_id,event,detail) VALUES(?,?,?)")
          .bind(row.image_id,state==="PUBLISHED"?"postiz_published":"postiz_failed","Postiz "+state+" for verified @discoverxploration post "+postId)
      ]);
      if(changes[0]?.results?.length&&changes[1]?.results?.length){
        if(state==="PUBLISHED")result.published++;else result.failed++;
      }
    }else if(state==="QUEUE"||state==="SCHEDULED"){
      await env.DB.prepare(
        "UPDATE publication_jobs SET provider_status=?,last_checked_at="+NOW+" WHERE image_id=? AND status='scheduled'"
      ).bind(state,row.image_id).run();
      result.still_scheduled++;
    }else result.ignored++;
  }
  return result;
}
