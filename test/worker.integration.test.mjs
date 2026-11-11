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
   assert.equal(events.data.events.length,1);
   assert.equal(events.data.events[0].event,"approved");
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
