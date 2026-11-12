import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/worker.js";
import { processRejectionCleanup } from "../src/operations.js";

const SCHEMA=readFileSync(new URL("../database/schema.sql", import.meta.url),"utf8");
const OWNER="review-test@example.invalid";
function createHarness() {
 const db=new DatabaseSync(":memory:");
 db.exec(SCHEMA);
 class Statement {
   constructor(sql,args=[]){this.sql=sql;this.args=args;}
   bind(...args){return new Statement(this.sql,args)}
   async first(){return db.prepare(this.sql).get(...this.args)||null}
   async all(){return {results:db.prepare(this.sql).all(...this.args)}}
   async run(){
     let results=[];
     const s=db.prepare(this.sql);
     if(/\bRETURNING\b/i.test(this.sql)) results=s.all(...this.args);
     else s.run(...this.args);
     const changes=db.prepare("SELECT changes() AS n").get().n;
     return {results,meta:{changes}};
   }
 }
 const DB={
   prepare(sql){return new Statement(sql)},
   async batch(stmts){
     db.exec("BEGIN TRANSACTION");
     try{const out=[];for(const stmt of stmts)out.push(await stmt.run());db.exec("COMMIT");return out}
     catch(e){db.exec("ROLLBACK");throw e}
   }
 };
 const media=new Map();let failDeletes=0;let deleteCalls=0;
 const PENDING={
   list:async ({prefix})=>({objects:[...media.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}),
   get:async key=>media.has(key)?{body:media.get(key),httpMetadata:{contentType:"image/jpeg"}}:null,
   put:async (key,body)=>{media.set(key,new TextEncoder().encode(body))},
   delete:async key=>{deleteCalls++;if(failDeletes-->0)throw Error("Synthetic R2 fault");media.delete(key)}
 };
 const env={DB,PENDING,OWNER_EMAIL:OWNER};
 function url(path,options={}) {
   return new Request("https://review.titanrigs.com"+path,{...options,headers:{"Cf-Access-Authenticated-User-Email":OWNER,...options.headers}});
 }
 async function call(path,options={}){
   const res=await worker.fetch(url(path,options),env);
   return {status:res.status,data:res.headers.get("content-type")?.includes("json")?await res.json():await res.text()};
 }
 async function decision(id,value){
   return call("/api/decision",{method:"POST",headers:{Origin:"https://review.titanrigs.com","Content-Type":"application/json"},body:JSON.stringify({id,decision:value})});
 }
 function addImage(batch,index){
   const key="review/pending/"+batch+"/"+index+".jpg";
   media.set(key,new Uint8Array([255,216,255,217]));
   return {id:batch+"-"+index,key};
 }
 return {db,env,media,url,call,decision,addImage,setFailDeletes:n=>{failDeletes=n},getDeleteCalls:()=>deleteCalls,close:()=>db.close()};
}

test("owner-only review, two independent decisions, held plans, no Postiz IDs",async()=>{
 const h=createHarness();try {
   const a=h.addImage("testbatch20261112",0),b=h.addImage("testbatch20261112",1);
   const unauthorized=await worker.fetch(new Request("https://review.titanrigs.com/api/items"),h.env);
   assert.equal(unauthorized.status,403);
   const pending=await h.call("/api/items?status=pending");
   assert.equal(pending.status,200);
   assert.equal(pending.data.items.length,2);
   const yes=await h.decision(a.id,"approved");
   assert.equal(yes.status,200);
   assert.equal(yes.data.publication_state,"held");
   assert.equal(yes.data.publishing_enabled,false);
   assert.equal(yes.data.manifest_state,"staged");
   assert.equal(h.media.has("review/held/"+a.id+".json"),true);
   assert.ok(yes.data.planned_at.endsWith("12:30:00Z"));
   const no=await h.decision(b.id,"rejected");
   assert.equal(no.status,200);
   assert.equal(no.data.cleanup,"complete");
   assert.equal(h.media.has(b.key),false);
   assert.equal(h.media.has(a.key),true);
   const twice=await h.decision(a.id,"approved");
   assert.equal(twice.status,409);
   const jobs=await h.call("/api/jobs");
   assert.equal(jobs.status,200);
   assert.equal(jobs.data.jobs.length,1);
   assert.equal(jobs.data.jobs[0].status,"held");
   assert.equal(jobs.data.jobs[0].postiz_post_id,null);
   assert.equal(jobs.data.publishing_enabled,false);
   const approved=await h.call("/api/items?status=approved");
   assert.equal(approved.data.items.length,1);
   assert.equal(approved.data.items[0].planned_at,yes.data.planned_at);
   const events=await h.call("/api/events?id="+a.id);
   assert.equal(events.data.events.length,2);
   assert.deepEqual(events.data.events.map(x=>x.event).sort(),["approved","manifest_staged"]);
 } finally {h.close();}
});

test("rejection cleanup failure is durable and retry succeeds",async()=>{
 const h=createHarness();try{
  const item=h.addImage("retrybatch20261112",2);
  await h.call("/api/items?status=pending");
  h.setFailDeletes(1);
  const r=await h.decision(item.id,"rejected");
  assert.equal(r.status,200);
  assert.equal(r.data.cleanup,"pending");
  let row=h.db.prepare("SELECT status,attempts FROM cleanup_jobs WHERE image_id=?").get(item.id);
  assert.equal(row.status,"pending");
  assert.equal(row.attempts,1);
  assert.equal(h.media.has(item.key),true);
  const retry=await processRejectionCleanup(h.env,item.id);
  assert.equal(retry.status,"complete");
  row=h.db.prepare("SELECT status,attempts FROM cleanup_jobs WHERE image_id=?").get(item.id);
  assert.equal(row.status,"complete");
  assert.equal(h.media.has(item.key),false);
 }finally{h.close()}
});

test("45-minute-old pending card is not deleted; 49-hour-old pending card expires via cleanup cron",async()=>{
 const h=createHarness();try{
  const old=h.addImage("expirebatch20261112",0);
  const recent=h.addImage("expirebatch20261112",1);
  await h.call("/api/items?status=pending");
  h.db.prepare("UPDATE image_reviews SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-49 hours') WHERE id=?").run(old.id);
  let promise;
  await worker.scheduled({},h.env,{waitUntil:p=>{promise=p}});
  await promise;
  const oldRow=h.db.prepare("SELECT status FROM image_reviews WHERE id=?").get(old.id);
  const newRow=h.db.prepare("SELECT status FROM image_reviews WHERE id=?").get(recent.id);
  assert.equal(oldRow.status,"rejected");
  assert.equal(newRow.status,"pending");
  assert.equal(h.media.has(old.key),false);
  assert.equal(h.media.has(recent.key),true);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM publication_jobs").get().n,0);
 }finally{h.close()}
});

test("failed deletion appears in Issues, then owner can retry safely",async()=>{
 const h=createHarness();try{
  const item=h.addImage("fivefails20261112",3);
  await h.call("/api/items?status=pending");
  h.setFailDeletes(5);
  const outcome=await h.decision(item.id,"rejected");
  assert.equal(outcome.status,200);
  for(let n=0;n<4;n++)await processRejectionCleanup(h.env,item.id);
  const failed=h.db.prepare("SELECT status,attempts FROM cleanup_jobs WHERE image_id=?").get(item.id);
  assert.equal(failed.status,"failed");
  assert.equal(failed.attempts,5);
  const issues=await h.call("/api/items?status=error");
  assert.equal(issues.status,200);
  assert.equal(issues.data.items.length,1);
  assert.equal(issues.data.items[0].cleanup_state,"failed");
  const payload={method:"POST",headers:{Origin:"https://review.titanrigs.com","Content-Type":"application/json"},body:JSON.stringify({id:item.id})};
  const retried=await h.call("/api/cleanup/retry",payload);
  assert.equal(retried.status,200);
  assert.equal(retried.data.cleanup,"complete");
  assert.equal(h.media.has(item.key),false);
  const again=await h.call("/api/cleanup/retry",payload);
  assert.equal(again.status,409);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM publication_jobs").get().n,0);
 }finally{h.close()}
});

test("dry-run scheduling is individually approved, owner-only, and idempotent without Postiz",async()=>{
 const h=createHarness();try{
  const images=[0,1,2,3].map(n=>h.addImage("simulation20261112",n));
  await h.call("/api/items?status=pending");
  const payload=(id,action)=>({method:"POST",headers:{Origin:"https://review.titanrigs.com","Content-Type":"application/json"},body:JSON.stringify({id,action})});
  const unapproved=await h.call("/api/dry-run",payload(images[0].id,"prepare"));
  assert.equal(unapproved.status,409);
  const unauthorized=await worker.fetch(new Request("https://review.titanrigs.com/api/dry-run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:images[0].id,action:"prepare"})}),h.env);
  assert.equal(unauthorized.status,403);
  const accepted=[];
  for(const image of images){
   const reviewed=await h.decision(image.id,"approved");
   assert.equal(reviewed.status,200);
   accepted.push(reviewed.planned_at);
   const simulated=await h.call("/api/dry-run",payload(image.id,"prepare"));
   assert.equal(simulated.status,200);
   assert.equal(simulated.data.simulation_state,"simulated_scheduled");
   assert.equal(simulated.data.publishing_enabled,false);
   assert.equal(simulated.data.real_postiz_request,false);
   assert.equal(simulated.data.duplicate,false);
   assert.equal(simulated.data.planned_at,reviewed.data.planned_at);
  }
  const repeated=await h.call("/api/dry-run",payload(images[0].id,"prepare"));
  assert.equal(repeated.status,200);
  assert.equal(repeated.data.duplicate,true);
  const rows=h.db.prepare("SELECT image_id,status,COUNT(*) AS c FROM publication_simulations GROUP BY image_id").all();
  assert.equal(rows.length,4);
  assert.ok(rows.every(r=>r.status==="simulated_scheduled"&&r.c===1));
  const real=h.db.prepare("SELECT status,postiz_post_id FROM publication_jobs").all();
  assert.equal(real.length,4);
  assert.ok(real.every(r=>r.status==="held"&&r.postiz_post_id===null));
  const approved=await h.call("/api/items?status=approved");
  assert.equal(approved.status,200);
  assert.equal(approved.data.items.length,0);
  const view=await h.call("/api/items?status=scheduled");
  assert.equal(view.status,200);
  assert.equal(view.data.items.length,4);
  assert.ok(view.data.items.every(i=>i.simulation_state==="simulated_scheduled"&&i.publication_state==="held"));
  const results=await h.call("/api/simulations");
  assert.equal(results.status,200);
  assert.equal(results.data.simulations.length,4);
  assert.equal(results.data.publishing_enabled,false);
 }finally{h.close()}
});
test("mock reconciliation never retries Postiz, and uncertain can only be resolved",async()=>{
 const h=createHarness();try{
  const image=h.addImage("uncertainbatch20261112",2);
  await h.call("/api/items?status=pending");
  const payload=(action)=>({method:"POST",headers:{Origin:"https://review.titanrigs.com","Content-Type":"application/json"},body:JSON.stringify({id:image.id,action})});
  await h.decision(image.id,"approved");
  assert.equal((await h.call("/api/dry-run",payload("prepare"))).data.simulation_state,"simulated_scheduled");
  assert.equal((await h.call("/api/dry-run",payload("uncertain"))).data.simulation_state,"simulated_uncertain");
  const again=await h.call("/api/dry-run",payload("prepare"));
  assert.equal(again.data.duplicate,true);
  assert.equal(again.data.simulation_state,"simulated_uncertain");
  const checked=await h.call("/api/dry-run",payload("published"));
  assert.equal(checked.data.simulation_state,"simulated_published");
  assert.equal((await h.call("/api/dry-run",payload("failed"))).status,409);
  const job=h.db.prepare("SELECT status,postiz_post_id,attempts FROM publication_jobs WHERE image_id=?").get(image.id);
  assert.deepEqual({status:job.status,postiz_post_id:job.postiz_post_id,attempts:job.attempts},{status:"held",postiz_post_id:null,attempts:0});
  const events=h.db.prepare("SELECT event FROM review_events WHERE image_id=?").all(image.id).map(x=>x.event);
  assert.equal(events.filter(x=>x==="dry_run_scheduled").length,1);
  assert.equal(events.filter(x=>x==="dry_run_uncertain").length,1);
  assert.equal(events.filter(x=>x==="dry_run_published").length,1);
 }finally{h.close()}
});
test("rejected, absent and non-JPEG images can never enter dry-run publication",async()=>{
 const h=createHarness();try{
  const payload=(id)=>({method:"POST",headers:{Origin:"https://review.titanrigs.com","Content-Type":"application/json"},body:JSON.stringify({id,action:"prepare"})});
  const rejected=h.addImage("testrejected20261112",1);
  const missing=h.addImage("testmissing20261112",0);
  const corrupt=h.addImage("testcorrupt20261112",3);
  await h.call("/api/items?status=pending");
  await h.decision(rejected.id,"rejected");
  assert.equal((await h.call("/api/dry-run",payload(rejected.id))).status,409);
  await h.decision(missing.id,"approved");
  h.media.delete(missing.key);
  assert.equal((await h.call("/api/dry-run",payload(missing.id))).status,409);
  await h.decision(corrupt.id,"approved");
  h.media.set(corrupt.key,new Uint8Array([0,1,2,3]));
  assert.equal((await h.call("/api/dry-run",payload(corrupt.id))).status,422);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM publication_simulations").get().n,0);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM publication_jobs WHERE postiz_post_id IS NOT NULL").get().n,0);
 }finally{h.close()}
});

test("simulated scheduled/published entries appear in their tabs, while real jobs stay held",async()=>{
 const h=createHarness();try{
  const a=h.addImage("statusbatch20261112",1),b=h.addImage("statusbatch20261112",3);
  await h.call("/api/items?status=pending");
  await h.decision(a.id,"approved");await h.decision(b.id,"approved");
  const payload=(id,action)=>({method:"POST",headers:{Origin:"https://review.titanrigs.com","Content-Type":"application/json"},body:JSON.stringify({id,action})});
  assert.equal((await h.call("/api/items?status=approved")).data.items.length,2);
  assert.equal((await h.call("/api/dry-run",payload(a.id,"prepare"))).status,200);
  const scheduled=await h.call("/api/items?status=scheduled");
  assert.deepEqual(scheduled.data.items.map(x=>x.id),[a.id]);
  assert.equal(scheduled.data.items[0].display_status,"scheduled");
  assert.equal(scheduled.data.items[0].simulation_state,"simulated_scheduled");
  assert.equal(scheduled.data.items[0].status,"approved");
  assert.equal(scheduled.data.items[0].publication_state,"held");
  assert.equal(scheduled.data.stats.scheduled,1);
  assert.equal(scheduled.data.stats.approved,1);
  assert.equal((await h.call("/api/dry-run",payload(a.id,"published"))).status,200);
  const published=await h.call("/api/items?status=published");
  assert.deepEqual(published.data.items.map(x=>x.id),[a.id]);
  assert.equal(published.data.items[0].display_status,"published");
  assert.equal(published.data.items[0].simulation_state,"simulated_published");
  assert.equal(published.data.items[0].postiz_post_id,null);
  assert.equal(published.data.stats.published,1);
  assert.equal(published.data.stats.scheduled||0,0);
  assert.deepEqual((await h.call("/api/items?status=approved")).data.items.map(x=>x.id),[b.id]);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM publication_jobs WHERE status!='held' OR postiz_post_id IS NOT NULL").get().n,0);
 }finally{h.close()}
});
test("simulated failure/uncertainty appear in Issues and can reconcile without resending",async()=>{
 const h=createHarness();try{
  const a=h.addImage("issuesbatch20261112",0),b=h.addImage("issuesbatch20261112",1);
  await h.call("/api/items?status=pending");
  const payload=(id,action)=>({method:"POST",headers:{Origin:"https://review.titanrigs.com","Content-Type":"application/json"},body:JSON.stringify({id,action})});
  for(const x of [a,b]){await h.decision(x.id,"approved");await h.call("/api/dry-run",payload(x.id,"prepare"));}
  await h.call("/api/dry-run",payload(a.id,"failed"));
  await h.call("/api/dry-run",payload(b.id,"uncertain"));
  const issues=await h.call("/api/items?status=error");
  assert.deepEqual(issues.data.items.map(x=>x.id),[a.id,b.id]);
  assert.equal(issues.data.stats.error,2);
  await h.call("/api/dry-run",payload(b.id,"verified_scheduled"));
  assert.deepEqual((await h.call("/api/items?status=scheduled")).data.items.map(x=>x.id),[b.id]);
  assert.deepEqual((await h.call("/api/items?status=error")).data.items.map(x=>x.id),[a.id]);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM publication_jobs WHERE status!='held' OR postiz_post_id IS NOT NULL").get().n,0);
 }finally{h.close()}
});

test("calendar keeps independent held slots and reschedule/cancel/restore never contacts Postiz",async()=>{
 const h=createHarness();try{
  const one=h.addImage("calendarbatch20261112",0),two=h.addImage("calendarbatch20261112",1);
  await h.call("/api/items?status=pending");
  const a=await h.decision(one.id,"approved"),b=await h.decision(two.id,"approved");
  assert.equal(a.status,200);assert.equal(b.status,200);
  const slot=new Date(Date.now()+6*86400000).toISOString().slice(0,16)+":00Z";
  const future=new Date(Date.now()+9*86400000).toISOString().slice(0,16)+":00Z";
  const act=(id,action,publish_at,expected_at)=>h.call("/api/slot",{
   method:"POST",headers:{Origin:"https://review.titanrigs.com","Content-Type":"application/json"},
   body:JSON.stringify({id,action,publish_at,expected_at})
  });
  const unauthorized=await worker.fetch(new Request("https://review.titanrigs.com/api/slot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:one.id,action:"cancel"})}),h.env);
  assert.equal(unauthorized.status,403);
  const changed=await act(one.id,"reschedule",slot,a.data.planned_at);
  assert.equal(changed.status,200);
  assert.equal(changed.data.status,"held");assert.equal(changed.data.planned_at,slot);
  assert.equal(changed.data.publishing_enabled,false);
  assert.equal(h.db.prepare("SELECT publish_at FROM publication_jobs WHERE image_id=?").get(one.id).publish_at,slot);
  const stale=await act(one.id,"reschedule",future,a.data.planned_at);
  assert.equal(stale.status,409);
  const conflicting=await act(two.id,"reschedule",slot,b.data.planned_at);
  assert.equal(conflicting.status,409);
  // Newly scheduled times are uniquely held and appear on the IST calendar.
  const month=new Date(Date.parse(slot)+330*60000).toISOString().slice(0,7);
  const cal=await h.call("/api/calendar?month="+month);
  assert.equal(cal.status,200);
  assert.equal(cal.data.timezone,"Asia/Kolkata");
  assert.ok(cal.data.items.some(x=>x.image_id===one.id&&x.publish_at===slot));
  assert.equal(cal.data.publishing_enabled,false);
  const cancel=await act(one.id,"cancel",undefined,slot);
  assert.equal(cancel.status,200);
  assert.equal(cancel.data.status,"cancelled");
  assert.equal(cancel.data.manifest_state,"deleted");
  assert.ok(h.media.has(one.key));
  assert.ok(!h.media.has("review/held/"+one.id+".json"));
  assert.equal(h.db.prepare("SELECT status FROM publication_jobs WHERE image_id=?").get(one.id).status,"cancelled");
  const idem=await act(one.id,"cancel");
  assert.equal(idem.data.duplicate,true);
  const approved=await h.call("/api/items?status=approved");
  assert.equal(approved.data.items.find(x=>x.id===one.id).planned_at,null);
  const again=await h.call("/api/calendar?month="+month);
  assert.ok(!again.data.items.some(x=>x.image_id===one.id));
  const restored=await act(one.id,"restore",future,slot);
  assert.equal(restored.status,200);
  assert.equal(restored.data.status,"held");assert.equal(restored.data.planned_at,future);
  assert.ok(h.media.has("review/held/"+one.id+".json"));
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM review_events WHERE image_id=? AND event LIKE 'slot_%'").get(one.id).n,3);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM publication_jobs WHERE postiz_post_id IS NOT NULL OR status NOT IN ('held')").get().n,0);
 }finally{h.close()}
});
test("editing a held slot invalidates stale mock publication but does not touch real state",async()=>{
 const h=createHarness();try{
  const x=h.addImage("simulationedit20261112",3);
  await h.call("/api/items?status=pending");
  const yes=await h.decision(x.id,"approved");
  const body=(path,data)=>h.call(path,{method:"POST",headers:{Origin:"https://review.titanrigs.com","Content-Type":"application/json"},body:JSON.stringify(data)});
  await body("/api/dry-run",{id:x.id,action:"prepare"});
  await body("/api/dry-run",{id:x.id,action:"published"});
  assert.equal((await h.call("/api/items?status=published")).data.items.length,1);
  const later=new Date(Date.now()+10*86400000).toISOString().slice(0,16)+":00Z";
  const edited=await body("/api/slot",{id:x.id,action:"reschedule",publish_at:later,expected_at:yes.data.planned_at});
  assert.equal(edited.status,200);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM publication_simulations").get().n,0);
  assert.equal((await h.call("/api/items?status=published")).data.items.length,0);
  assert.equal((await h.call("/api/items?status=approved")).data.items.length,1);
  const real=h.db.prepare("SELECT status,postiz_post_id FROM publication_jobs WHERE image_id=?").get(x.id);
  assert.equal(real.status,"held");
  assert.equal(real.postiz_post_id,null);
 }finally{h.close()}
});
test("failed held-manifest deletion is retried by maintenance without removing approved JPEG",async()=>{
 const h=createHarness();try{
  const item=h.addImage("cancelretry20261112",2);
  await h.call("/api/items?status=pending");
  const yes=await h.decision(item.id,"approved");
  h.setFailDeletes(1);
  const result=await h.call("/api/slot",{method:"POST",headers:{Origin:"https://review.titanrigs.com","Content-Type":"application/json"},body:JSON.stringify({id:item.id,action:"cancel",expected_at:yes.data.planned_at})});
  assert.equal(result.status,200);assert.equal(result.data.manifest_state,"retry_pending");
  assert.ok(h.db.prepare("SELECT last_error FROM publication_jobs WHERE image_id=?").get(item.id).last_error.startsWith("Manifest cleanup:"));
  let wait;
  await worker.scheduled({},h.env,{waitUntil:p=>{wait=p}});
  await wait;
  assert.equal(h.db.prepare("SELECT last_error FROM publication_jobs WHERE image_id=?").get(item.id).last_error,null);
  assert.ok(!h.media.has("review/held/"+item.id+".json"));
  assert.ok(h.media.has(item.key));
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM publication_jobs WHERE status='cancelled'").get().n,1);
 }finally{h.close()}
});
