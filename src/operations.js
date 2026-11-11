import { firstPostingSlot, MAX_CLEANUP_ATTEMPTS, nextCleanupTime, LIVE_POSTING_ENABLED } from "./queue.js";
import { writeHeldManifest } from "./manifest.js";

const MATCH_KEY = /^review\/pending\/([A-Za-z0-9_-]{8,80})\/([0-3])\.(jpg|jpeg|png|webp)$/i;
const utcNowSQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export function validReviewKey(value) { return typeof value === "string" && MATCH_KEY.test(value); }
export class ReviewConflict extends Error { constructor(message = "This image has already been reviewed") { super(message); this.status = 409; } }

const approveSQL = [
  `UPDATE image_reviews SET status='approved',decided_at=${utcNowSQL},updated_at=${utcNowSQL}
    WHERE id=? AND status='pending' RETURNING id,object_key,status`,
  `INSERT INTO publication_jobs(image_id,publish_at,status)
    SELECT id, strftime('%Y-%m-%dT%H:%M:%SZ',
       max(unixepoch(?),
         coalesce((SELECT max(unixepoch(publish_at))+86400 FROM publication_jobs WHERE status<>'cancelled'),0)),
       'unixepoch'), 'held'
    FROM image_reviews WHERE id=? AND status='approved'
      AND NOT EXISTS (SELECT 1 FROM publication_jobs WHERE image_id=?)`,
  `INSERT INTO review_events(image_id,event,detail)
    SELECT id,'approved','Reserved future time; publishing disabled'
    FROM image_reviews WHERE id=? AND changes()=1`
];
const rejectSQL = [
  `UPDATE image_reviews SET status='rejected',decided_at=${utcNowSQL},updated_at=${utcNowSQL}
    WHERE id=? AND status='pending' RETURNING id,object_key,status`,
  `INSERT OR IGNORE INTO cleanup_jobs(image_id,object_key,status)
    SELECT id,object_key,'pending' FROM image_reviews
    WHERE id=? AND status='rejected'`,
  `INSERT INTO review_events(image_id,event,detail)
    SELECT id,'rejected',? FROM image_reviews WHERE id=? AND changes()=1`
];

export async function reviewDecision(env, id, decision, reason="manual") {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,80}-[0-3]$/.test(id)) {
    throw Object.assign(new Error("Invalid review item"),{status:400});
  }
  if (!["approved","rejected"].includes(decision)) {
    throw Object.assign(new Error("Invalid decision"),{status:400});
  }
  const item = await env.DB.prepare("SELECT id,object_key,status FROM image_reviews WHERE id=?").bind(id).first();
  if (!item || item.status !== "pending") throw new ReviewConflict();
  if (!validReviewKey(item.object_key)) throw new Error("Cannot alter an invalid R2 review key");
  if (decision === "approved") {
    const slot = firstPostingSlot();
    const batches = await env.DB.batch([
      env.DB.prepare(approveSQL[0]).bind(id),
      env.DB.prepare(approveSQL[1]).bind(slot,id,id),
      env.DB.prepare(approveSQL[2]).bind(id)
    ]);
    if (!batches[0]?.results?.length) throw new ReviewConflict();
    if (batches[1]?.meta?.changes !== 1) throw new Error("Could not reserve a unique publishing time");
    const job = await env.DB.prepare("SELECT image_id,publish_at,status FROM publication_jobs WHERE image_id=?").bind(id).first();
    if (!job || job.status !== "held") throw new Error("Publication hold was not recorded");
    const manifest=await writeHeldManifest(env,id);
    return {id,status:"approved",planned_at:job.publish_at,publication_state:"held",manifest_state:manifest.status,publishing_enabled:LIVE_POSTING_ENABLED};
  }
  const batches = await env.DB.batch([
    env.DB.prepare(rejectSQL[0]).bind(id),
    env.DB.prepare(rejectSQL[1]).bind(id),
    env.DB.prepare(rejectSQL[2]).bind(reason,id)
  ]);
  if (!batches[0]?.results?.length) throw new ReviewConflict();
  const cleaned=await processRejectionCleanup(env,id);
  return {id,status:"rejected",cleanup:cleaned.status,publishing_enabled:LIVE_POSTING_ENABLED};
}

export async function processRejectionCleanup(env,id) {
  const job=await env.DB.prepare(`SELECT c.image_id,c.object_key,c.status,c.attempts,i.status AS review_status
    FROM cleanup_jobs c JOIN image_reviews i ON i.id=c.image_id WHERE c.image_id=?`).bind(id).first();
  if (!job || !["pending","failed"].includes(job.status)) return {status:job?.status??"missing"};
  if (job.review_status!=="rejected" || !validReviewKey(job.object_key)) {
    return {status:"blocked",reason:"Object not rejected or key invalid"};
  }
  try {
    await env.PENDING.delete(job.object_key);
    await env.DB.prepare(`UPDATE cleanup_jobs SET status='complete',completed_at=${utcNowSQL},
      updated_at=${utcNowSQL},next_attempt_at=NULL,last_error=NULL
      WHERE image_id=? AND status IN ('pending','failed')`).bind(id).run();
    return {status:"complete"};
  } catch(error) {
    const attempts=Number(job.attempts)+1;
    const final=attempts>=MAX_CLEANUP_ATTEMPTS;
    await env.DB.prepare(`UPDATE cleanup_jobs SET status=?,attempts=?,next_attempt_at=?,last_error=?,
      updated_at=${utcNowSQL} WHERE image_id=? AND status IN ('pending','failed')`)
      .bind(final?"failed":"pending",attempts,final?null:nextCleanupTime(attempts),String(error).slice(0,250),id).run();
    return {status:final?"failed":"pending",attempts};
  }
}

export async function retryFailedCleanup(env,id) {
  if (typeof id!=="string" || !/^[A-Za-z0-9_-]{8,80}-[0-3]$/.test(id)) {
    throw Object.assign(new Error("Invalid image ID"),{status:400});
  }
  const changed=await env.DB.prepare(`UPDATE cleanup_jobs SET status='pending',attempts=0,
    next_attempt_at=NULL,last_error=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE image_id=? AND status='failed'
      AND EXISTS(SELECT 1 FROM image_reviews WHERE id=? AND status='rejected')
    RETURNING image_id`).bind(id,id).first();
  if(!changed)throw new ReviewConflict("No failed, rejected cleanup to retry");
  const outcome=await processRejectionCleanup(env,id);
  await env.DB.prepare("INSERT INTO review_events(image_id,event,detail) VALUES(?,?,?)")
    .bind(id,"cleanup_retry",outcome.status).run();
  return {id,cleanup:outcome.status};
}

export async function maintenance(env,{expiryHours=48,maxItems=20}={}) {
  // This maintenance deliberately never touches Postiz or transitions held publication jobs.
  const clean=await env.DB.prepare(`SELECT image_id FROM cleanup_jobs
    WHERE status='pending' AND (next_attempt_at IS NULL OR unixepoch(next_attempt_at)<=unixepoch('now'))
    ORDER BY created_at LIMIT ?`).bind(maxItems).all();
  let cleanDone=0,cleanFailed=0;
  for (const row of clean.results||[]) {
    const result=await processRejectionCleanup(env,row.image_id);
    if(result.status==="complete")cleanDone++;
    if(result.status==="failed"||result.status==="pending")cleanFailed++;
  }
  const due=await env.DB.prepare(`SELECT id FROM image_reviews WHERE status='pending'
    AND unixepoch(created_at)<unixepoch('now')-? ORDER BY created_at LIMIT ?`)
    .bind(expiryHours*3600,maxItems).all();
  let expired=0;
  for (const row of due.results||[]) {
    try { await reviewDecision(env,row.id,"rejected","48-hour review timeout"); expired++; }
    catch(e){if(!(e instanceof ReviewConflict)) throw e;}
  }
  return {cleanDone,cleanFailed,expired,publishing_enabled:false};
}

export async function queueStats(env) {
  const statuses=await env.DB.prepare("SELECT status,COUNT(*) AS n FROM image_reviews GROUP BY status").all();
  const jobs=await env.DB.prepare("SELECT status,COUNT(*) AS n FROM publication_jobs GROUP BY status").all();
  const failures=await env.DB.prepare("SELECT COUNT(*) AS n FROM cleanup_jobs WHERE status='failed'").first();
  return {reviews:Object.fromEntries((statuses.results||[]).map(x=>[x.status,x.n])),
          publication:Object.fromEntries((jobs.results||[]).map(x=>[x.status,x.n])),
          cleanup_failures:failures?.n||0,
          publishing_enabled:LIVE_POSTING_ENABLED};
}
