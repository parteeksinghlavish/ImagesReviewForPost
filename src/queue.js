// Pure scheduling rules. Deliberately no Postiz or Instagram API calls.
export const LIVE_POSTING_ENABLED = false;
export const DEFAULT_TZ = "Asia/Kolkata";
export const SLOT_HOUR_IST = 18;
export const SLOT_MINUTE_IST = 0;
export const SLOT_GAP_SECONDS = 86400;
export const MAX_CLEANUP_ATTEMPTS = 5;

export function firstPostingSlot(now = new Date(), leadMs = 60 * 60 * 1000) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new TypeError("Invalid current time");
  const earliest = nowMs + leadMs;
  const ist = new Date(earliest + 330 * 60 * 1000);
  let slotMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 12, 30, 0);
  if (slotMs < earliest) slotMs += 86400000;
  return new Date(slotMs).toISOString().replace(".000Z", "Z");
}

export function cleanupDelaySeconds(attempts) {
  const sequence = [60, 300, 900, 3600, 21600];
  const index = Math.max(0, Math.min(sequence.length - 1, Math.trunc(attempts) - 1));
  return sequence[index];
}

export function nextCleanupTime(attempts, now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError("Invalid current time");
  return new Date(timestamp + cleanupDelaySeconds(attempts) * 1000).toISOString();
}

// A future adapter must explicitly take a held item through a new, reviewed activation.
// No code in this project currently calls Postiz or another publishing service.
export function isPublishingEnabled() { return LIVE_POSTING_ENABLED; }

export const RECONCILIATION_TRANSITIONS = Object.freeze({
  held: [],
  dispatching: ["scheduled", "retry_wait", "uncertain", "failed"],
  scheduled: ["published", "retry_wait", "uncertain", "failed"],
  retry_wait: ["dispatching", "failed"],
  uncertain: ["scheduled", "published", "failed"],
  failed: ["retry_wait", "cancelled"],
  published: [],
  cancelled: []
});

export function canReconcile(from, to) {
  return RECONCILIATION_TRANSITIONS[from]?.includes(to) ?? false;
}
