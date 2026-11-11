import test from "node:test";
import assert from "node:assert/strict";
import {firstPostingSlot, cleanupDelaySeconds, nextCleanupTime, LIVE_POSTING_ENABLED, canReconcile} from "../src/queue.js";

test("hard publishing safety lock stays off", () => {
  assert.equal(LIVE_POSTING_ENABLED, false);
});
test("18:00 IST slot from midday in India", () => {
  assert.equal(firstPostingSlot("2026-11-11T10:00:00Z"), "2026-11-11T12:30:00Z");
});
test("next day if slot too near; never schedule in the past", () => {
  assert.equal(firstPostingSlot("2026-11-11T12:00:00Z"), "2026-11-12T12:30:00Z");
  assert.equal(firstPostingSlot("2026-11-11T13:00:00Z"), "2026-11-12T12:30:00Z");
});
test("independent days correctly handle month end", () => {
  assert.equal(firstPostingSlot("2026-11-30T20:00:00Z"), "2026-12-01T12:30:00Z");
});
test("rejected object cleanup has bounded backoff", () => {
  assert.deepEqual([1,2,3,4,5,6].map(cleanupDelaySeconds), [60,300,900,3600,21600,21600]);
  assert.equal(nextCleanupTime(1, "2026-11-11T00:00:00Z"), "2026-11-11T00:01:00.000Z");
});
test("manual reconciliation cannot skip held publishing gate", () => {
  assert.equal(canReconcile("held","dispatching"),false);
  assert.equal(canReconcile("held","published"),false);
  assert.equal(canReconcile("scheduled","published"),true);
  assert.equal(canReconcile("uncertain","published"),true);
  assert.equal(canReconcile("published","dispatching"),false);
});
