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
