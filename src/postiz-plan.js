// Pure Postiz payload preparation. No credentials, HTTP clients, or side effects.
// Live dispatch is intentionally impossible until a separately reviewed activation.
import { LIVE_POSTING_ENABLED } from "./queue.js";

const IMAGE_ID=/^[A-Za-z0-9_-]{8,80}-[0-3]$/;
const PENDING_KEY=/^review\/pending\/[A-Za-z0-9_-]{8,80}\/[0-3]\.jpg$/;
const ISO_UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

export function prepareSingleImagePost(record, media, integrationId) {
  if (!record || !IMAGE_ID.test(String(record.image_id)) ||
      record.review_status !== "approved" || record.status !== "held" ||
      !PENDING_KEY.test(String(record.object_key)) ||
      !ISO_UTC.test(String(record.publish_at)) ||
      !Number.isFinite(Date.parse(record.publish_at))) {
    throw new TypeError("Only a valid approved, held single-image job can be prepared");
  }
  if (!media || typeof media.id !== "string" || !media.id.trim() ||
      typeof media.path !== "string" || !/^https:\/\/insta\.titanrigs\.com\/[A-Za-z0-9_-]+\.jpe?g$/i.test(media.path)) {
    throw new TypeError("A verified Postiz upload receipt with a public single-image URL is required");
  }
  if (typeof integrationId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(integrationId)) {
    throw new TypeError("Postiz integration ID required");
  }
  return {
    type:"schedule",
    date:record.publish_at,
    posts:{post:[{
      integrationId,
      settings:{setting:[{key:"__type",stringValue:"instagram"},{key:"post_type",stringValue:"post"}]},
      value:{contentItem:[{image:{imageItem:[{id:media.id,path:media.path}]}}]}
    }]}
  };
}

// Explicit safety boundary: no code path can transmit a plan while paused.
export function assertLiveDispatchAllowed() {
  if (!LIVE_POSTING_ENABLED) throw new Error("Publishing is paused: no Postiz or Instagram calls permitted");
}
