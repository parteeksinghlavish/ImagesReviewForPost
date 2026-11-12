# ImagesReviewForPost

Independent swipe-review PWA for **DiscoverXploration**. This is **not** a JobVFX project.

- Live app: https://review.titanrigs.com/
- Cloudflare Worker: `social-image-review`
- D1: `social-image-review` (already provisioned)
- R2: existing `insta-workflow` bucket, protected `review/pending/` prefix
- Authentication: Cloudflare Access for the review domain, plus runtime `OWNER_EMAIL` secret

## Features

- Four Higgsfield collage crops are reviewed **independently**.
- Swipe right to approve, swipe left to reject; buttons and keyboard are supported.
- Pending images are streamed via the Worker R2 binding after authentication.
- Decision records persist in D1. Rejection deletes the matching object.
- Approved images are **not automatically scheduled yet**; publishing integration remains to be implemented and tested.

## Local setup

Use Node.js and Wrangler:

```bash
npm install
npm run deploy
```

`wrangler.jsonc` deploys to the **existing** `social-image-review` Worker and binds the existing D1 database and R2 bucket. It must not create or reset either resource. The existing custom domain and Access configuration must remain enabled.

Set `OWNER_EMAIL` using a Worker secret in Cloudflare (do not commit an email or token to the public repository):

```bash
npx wrangler secret put OWNER_EMAIL
```

Set it to the same email allowed by the Cloudflare Access policy. The Worker denies access if the secret is absent.

## Continuous deployment

Connect this repository's `main` branch to the existing `social-image-review` Worker under **Cloudflare Workers → social-image-review → Settings → Builds**.

Use repository root `/`, build command `npm install` and deploy command `npx wrangler deploy`. Cloudflare should only deploy after commits to `main`, preserving the existing domain, D1 and R2 bindings.

## Storage and security

The `insta-workflow` bucket also hosts public Postiz images. A **separate deployed Cloudflare WAF rule** blocks public HTTP access to `https://insta.titanrigs.com/review/pending/*`. The Worker accesses those keys privately through its R2 binding. Folder naming alone is not a security boundary.

Never publish pending image keys through another public endpoint or enable `r2.dev` for this bucket. Keep Cloudflare Access protecting the review hostname.

`database/schema.sql` is a reference of the existing D1 schema, not an automatic migration.

No API keys, credentials, personal email addresses or user data are committed to this repository.

## Deployment verification

Cloudflare Workers Builds is connected to the `main` branch. Changes committed to `main` trigger a production build and the `npx wrangler deploy` command. Verify the outcome in Cloudflare's **Deployments / Builds** history; a successful GitHub push alone does not prove deployment succeeded.

## P0/P1 implementation status (publishing paused)

- **P0 prepared:** each approved image gets a unique, held 18:00 IST posting slot in D1; one image per slot. A private `review/held/<image-id>.json` manifest records the intended single-image publication. `src/postiz-plan.js` prepares the exact one-image Postiz schedule payload only after a valid upload receipt, but **does not send it**.
- **P1 prepared:** approval history, queue/job inspection, bounded rejection cleanup retries, 48-hour pending-review expiry, manual cleanup retry and 15-minute maintenance cron. Publication reconciliation state transitions are defined but **not connected to the Postiz API**.
- **Hard safety lock:** `LIVE_POSTING_ENABLED=false`. The Worker makes **zero Postiz/Instagram requests**, and no Postiz scheduler or publisher is activated. Do not flip this constant as a shortcut: implement and review idempotent dispatch, receipt persistence, uncertain-result reconciliation and end-to-end tests first.
- **Build verification:** Cloudflare production builds run `npm install && npm test` before `npx wrangler deploy`. The latest successful test build ran 17 passing tests.

### Still required before live publishing

1. Implement a gated, authenticated publisher that downloads the approved private image, uploads it to Postiz, creates exactly one scheduled single-image post and atomically stores the provider receipt. Never publish on approval alone while the lock is off.
2. Implement Postiz status polling and safe reconciliation for scheduled/published/failed/uncertain results; uncertain outcomes must never automatically resend.
3. Test the entire pipeline with non-publishing fixtures, then explicitly obtain the owner's authorization before enabling any live Postiz schedule or Instagram publication.

## Dry-run Postiz workflow (safe to test)

Every approved image retains its real `publication_jobs.status = held` record. Open the approved card in the review app, choose **Dry-run single post**, and the Worker reads its private R2 JPEG, fabricates a Postiz upload receipt, validates the **one-image** schedule payload, and records it in the separate `publication_simulations` table. **No HTTP request to Postiz or Instagram occurs.** Repeating the operation is idempotent.

Use **Simulate published / failed / uncertain** to exercise reconciliation. Uncertain outcomes can be resolved through status changes only; no automatic resend is possible. Real held jobs and their `postiz_post_id` remain unchanged.

`GET /api/simulations` lists dry-run results, and `POST /api/dry-run` accepts owner-authenticated, same-origin JSON `{id,action}`, with actions `prepare`, `published`, `failed`, `uncertain` or `verified_scheduled`. These are simulations, **not actual Instagram results**.

The strict `LIVE_POSTING_ENABLED=false` guard remains in place. Future real Postiz upload and schedule adapters, status polling and uncertain-result recovery require a separate reviewed integration and explicit permission to activate publishing.

### Where simulated posts appear

Dry-run cards move between **Approved → Scheduled → Published** (or **Issues** for simulated failed/uncertain outcomes). Scheduled/Published cards are explicitly marked **SIMULATED** and **REAL: HELD · NO INSTAGRAM POST**. This changes display filtering only; the actual Postiz jobs remain held and nothing is sent to Instagram. An uncertain mock outcome may be verified without resending.

## Review workspace and calendar

The review interface now provides:

- **Pending**: swipe right to approve or left to reject, one image at a time.
- **All**: browse the full recent review queue (up to 200 items in this version), including active approvals, held plans and simulated results. Successfully deleted rejected cards are excluded.
- **Approved / Scheduled / Published / Issues**: use Previous/Next, left/right arrow keys and the thumbnail filmstrip to navigate records. A simulated published image moves out of Approved into Published and is prominently marked SIMULATED; its real job stays HELD.
- **Image activity**: authenticated event history for each image, including approval, manifest staging, simulated publication states and held-slot changes.
- **Calendar**: mobile-friendly month grid and agenda for approved HELD posting reservations. Times are shown in **Asia/Kolkata (IST)**; select an event to inspect its image.
- **Change held slot**: reserve a different date/time, validated at least one hour ahead and within 90 days; rejects duplicate slots and stale edits.
- **Cancel hold**: remove the held manifest but retain the approved JPEG and decision history; failed manifest deletion is retried by maintenance.
- **Reserve new slot**: restore a cancelled hold to a new future time. Changing or cancelling a slot clears earlier mock simulation outcomes for that image.

All of these are **internal scheduling plans only**. Postiz and Instagram are never contacted. The project retains `LIVE_POSTING_ENABLED=false`, and the actual `publication_jobs.postiz_post_id` remains NULL until a separately reviewed live-publishing integration is explicitly authorized.

### Current planning limitations

- The list UI currently loads at most 200 review cards per tab; pagination and full-text search are future work for larger queues.
- Under the current D1 schema, a cancelled slot remains a unique historical reservation. New slots are allocated after existing reservations, and cancellation does not retroactively free its original timestamp. Altering this requires a deliberate database migration.
- UI controls are validated by unit/integration tests and JavaScript syntax compilation; a full manual Android gesture/accessibility pass is still recommended.
- No real Postiz scheduling or provider reconciliation has been tested, because live posting is intentionally disabled.

### Rejected-image visibility

Rejected images are deleted from private R2 and **not displayed** in the All tab, navigation filmstrip, counts or a Rejected tab. D1 decision history and cleanup records remain for auditing; this change does not delete records. Exception: a rejected image whose R2 deletion exhausts retries stays visible **only under Issues**, where manual cleanup retry is available. Once cleanup succeeds, the item disappears from the interface.
