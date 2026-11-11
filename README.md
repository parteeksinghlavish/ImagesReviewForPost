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
