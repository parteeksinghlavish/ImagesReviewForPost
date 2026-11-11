import test from "node:test";
import assert from "node:assert/strict";
import {validReviewKey,ReviewConflict,queueStats} from "../src/operations.js";
import {LIVE_POSTING_ENABLED} from "../src/queue.js";

test("private pending R2 prefix is strictly validated",()=>{
  assert.equal(validReviewKey("review/pending/batch20261111/0.jpg"),true);
  assert.equal(validReviewKey("review/pending/batch20261111/3.webp"),true);
  assert.equal(validReviewKey("review/pending/batch20261111/4.jpg"),false);
  assert.equal(validReviewKey("review/pending/../../secret.jpg"),false);
  assert.equal(validReviewKey("public/0.jpg"),false);
  assert.equal(validReviewKey("review/pending/batch20261111/1.jpg/extra"),false);
});
test("publishing gate is off even when review queue has approved items",async()=>{
  assert.equal(LIVE_POSTING_ENABLED,false);
  const db={prepare(sql){return {all:async()=>({results:sql.includes("publication_jobs")?[{status:"held",n:4}]:[{status:"approved",n:4}]}),first:async()=>({n:0})}}};
  const result=await queueStats({DB:db});
  assert.equal(result.publishing_enabled,false);
  assert.equal(result.publication.held,4);
});
test("conflict is a safe 409",()=>assert.equal(new ReviewConflict().status,409));
