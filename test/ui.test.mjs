import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import worker from "../src/worker.js";
import { monthBoundsIST, validateSlot } from "../src/schedule.js";

test("review HTML contains queue browsing, calendar, slot and history controls and valid client script",async()=>{
 const owner="ui-test@example.invalid";
 const request=new Request("https://review.titanrigs.com/",{headers:{"Cf-Access-Authenticated-User-Email":owner}});
 const res=await worker.fetch(request,{OWNER_EMAIL:owner});
 assert.equal(res.status,200);
 const html=await res.text();
 for(const id of ["queueView","calendarView","calendarPanel","browseNav","previousCard","nextCard","filmstrip","modalRoot"]){
  assert.ok(html.includes('id="'+id+'"'),"Missing UI control "+id);
 }
 assert.match(html,/No real Postiz or Instagram requests/);
 assert.match(html,/const TABS=\['pending','all','approved','scheduled','published','error'\]/);
 assert.doesNotMatch(html,/rejected:'Rejected'/);
 assert.match(html,/Change held slot/);
 assert.match(html,/Reserve new slot/);
 assert.match(html,/View history/);
 assert.match(html,/Cancel hold/);
 assert.match(html,/function renderCalendar\(\)/);
 assert.match(html,/function navigate\(offset\)/);
 const script=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(script?.[1], "Client JS missing");
 assert.doesNotThrow(()=>new Script(script[1],{filename:"review-inline.js"}));
});
test("calendar boundaries use India Standard Time including year rollover",()=>{
 assert.deepEqual(monthBoundsIST("2026-12"),{
  month:"2026-12",timezone:"Asia/Kolkata",start:"2026-11-30T18:30:00Z",end:"2026-12-31T18:30:00Z"
 });
 assert.throws(()=>monthBoundsIST("2026-13"),/Calendar month/);
 assert.throws(()=>monthBoundsIST("invalid"),/Calendar month/);
});
test("held-slot validation enforces valid UTC date and safe future horizon",()=>{
 const now=new Date("2026-11-12T00:00:00Z");
 assert.equal(validateSlot("2026-11-12T12:30:00Z",now),"2026-11-12T12:30:00Z");
 for(const val of ["2026-11-12T00:30:00Z","2026-11-31T18:00:00Z",
  "2027-04-01T12:30:00Z","2026-11-13T12:30:00+05:30","2026-11-12","invalid"]){
  assert.throws(()=>validateSlot(val,now),"Expected rejection for "+val);
 }
});
test("review app still rejects unauthenticated visitors",async()=>{
 const res=await worker.fetch(new Request("https://review.titanrigs.com/"),{OWNER_EMAIL:"other@example.invalid"});
 assert.equal(res.status,403);
});
