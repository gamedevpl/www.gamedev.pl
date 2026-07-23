# Closed-beta launch on www.gamedev.pl

> Status: IN PROGRESS (started 2026-07-23; Phase A complete, Phase B next).
> This is the umbrella plan for
> pointing www.gamedev.pl at the new app and inviting beta users. It sequences
> existing approved plans (`closed-beta-splash-plan.md`,
> `content-safety-plan.md`, `creator-qa-plan.md`) plus the domain cutover,
> which is new scope. Owner decisions required are marked **[OWNER]**.

## Current state (verified live 2026-07-23)

- App live on Cloud Run in BOTH regions during the migration:
  - NEW (cutover target): `https://gamedev-app-334141807880.europe-west1.run.app`
    — bootstrapped 2026-07-23 (rev gamedev-app-00001-4wf), verified: `GET /`
    200, catalog 401, auth/me 401, health `privateBeta:true`, assets served
    brotli (72KB vs 250KB) + immutable, index.html no-cache. Deploy pipeline
    now targets this region.
  - OLD (frozen, delete after cutover):
    `https://gamedev-app-334141807880.europe-central2.run.app`.
- `PRIVATE_BETA=true`; anonymous `GET /` → 200 (closed-beta splash),
  `/api/catalog` → 401, `/api/health` reports `privateBeta: true`.
- Allowlist: `BETA_ALLOWED_UIDS` = owner's uid; `BETA_ALLOWED_EMAILS` unset.
  `email_verified` is enforced on the email path; deploy fails fast if both
  allowlist vars are empty while `PRIVATE_BETA=true`.
- **www.gamedev.pl still serves the OLD site** via GitHub Pages
  (`gh-pages` branch, legacy build, CNAME `www.gamedev.pl`, cert covers
  www + apex, HTTPS enforced). The new app is not reachable on the real
  domain yet.

## Phase A — finish the product queue (before invites)

Order matches the approved queue in the coordination channel. All agent work.

1. **DONE (5742bc36, 10f929ad)** — dependency security bumps — fastify Content-Type body-validation
   bypass (HIGH, prod-relevant: public `/api/auth/*` routes parse JSON);
   vitest/vite/launch-editor while in the lockfile. Lockfile discipline:
   `npm install --package-lock-only` must produce zero diff vs `npm ci`.
   Confirm Dependabot alerts close after push.
2. **DONE (5363739f + 9353826d wall fix; verified live: POST /api/waitlist
   no-body → 400)** — waitlist — per `closed-beta-splash-plan.md`: `POST /api/waitlist`
   (ID token re-verified server-side), `waitlist/{uid}` upsert, 403 sign-in →
   join CTA. This is what makes a closed beta on a public domain work:
   visitors who find the site can request access instead of hitting a dead
   end. Privacy invariants in that plan are hard requirements.
3. **DONE (slice 1: 7591ef8c; slice 1b: 59d944c0)** — content-safety
   slice 1 (regex layer) + 1b (Vertex layer) — per
   `content-safety-plan.md`. The hard sequencing rule there only blocks
   `PRIVATE_BETA=false` (going public), not the closed beta itself.
   **[OWNER]** decide: invite only personally-trusted people before slice 1
   lands, or hold invites until slice 1 is live. Recommendation: slice 1
   before any invitee the owner wouldn't vouch for.
4. **DONE (28ebdde7; verify live headers after deploy)** — static-serving
   fixes (small, self-contained; measured live
   2026-07-23: main JS bundle served 250 KB uncompressed with
   `cache-control: public, max-age=0` — every load revalidates everything
   against Cloud Run, no compression at all):
   - Precompress at build time: Vite emits `.br`/`.gz` next to each asset;
     register `fastifyStatic` with `preCompressed: true` (zero runtime CPU —
     Cloud Run bills CPU, so don't use on-the-fly `@fastify/compress`).
   - Cache headers via `setHeaders` on the static registration:
     `max-age=31536000, immutable` for `/assets/*` (content-hashed by Vite),
     `no-cache` for `index.html` (the deploy-rollout pivot).
   - This is also the prerequisite for Cloud CDN in Phase B — a CDN caches
     nothing behind `max-age=0`.
   - Verify live post-deploy: `curl -sI -H 'Accept-Encoding: br'` on a
     bundle URL → `content-encoding: br` + immutable cache-control;
     `index.html` → `no-cache`.
     Note: the heavy content (games) already serves from the games origin on
     GitHub Pages (Fastly CDN) — this item is about the app shell only.

Not launch-blocking (can land during the beta): creator Q&A flow
(`creator-qa-plan.md`), safety slice 2+.

## Phase B — domain cutover

This is the actual "launch on www.gamedev.pl" moment. Do it after A1
(security) at minimum; A2 (waitlist) strongly recommended first, since the
domain will get organic traffic the run.app URL never did.

5. **Delete the old site** (owner decision made 2026-07-23: delete, no
   archive subdomain). Concretely, at cutover time:
   - remove the custom domain from the repo's Pages settings (releases the
     cert claim on www + apex);
   - disable GitHub Pages on the repo / delete the `gh-pages` branch — the
     content also stops being served at `gamedevpl.github.io`;
   - the branch history remains in git, so this is reversible in the repo
     sense even though the site itself is gone.
6. **Build the domain wiring — DECIDED 2026-07-23 (owner): Cloud Run native
   domain mapping, which requires migrating the service to `europe-west1`.**
   Rationale: owner ruled out the ~$20/mo global LB and a Firebase Hosting
   proxy layer; native mapping is $0 with no extra layer. Constraints
   accepted with eyes open: domain mapping doesn't support the current
   `europe-central2` (docs verified 2026-07-23: asia-east1, asia-northeast1,
   asia-southeast1, europe-north1, europe-west1, europe-west4, us-central1,
   us-east1, us-east4, us-west1); the feature is _preview_ (documented
   added-latency caveat — acceptable at beta scale) and cannot disable TLS
   1.0/1.1. `europe-west1` chosen: Tier-1 pricing (cheaper per CPU-s than
   europe-central2), ~25ms from the Warsaw Firestore. Migration steps:
   - Create Artifact Registry repo `gamedev` in `europe-west1` (one-time).
   - deploy.yml + infra/deploy-api.sh: set the region to `europe-west1`;
     `WEB_ORIGIN` becomes the new deterministic URL + `https://www.gamedev.pl`
     - `https://gamedev.pl` (comma-separated).
   - Push → deploys the service fresh in europe-west1 (old europe-central2
     service keeps serving its URL untouched during transition; delete it
     - the old AR repo only after cutover is verified).
   - **[OWNER]** add the new run.app URL to the OAuth client's JS origins
     (needed to test sign-in on it pre-cutover).
   - **[OWNER]** verify domain ownership with Google (Search Console TXT
     record for gamedev.pl) — prerequisite for creating domain mappings.
   - Create domain mappings for `www.gamedev.pl` AND `gamedev.pl` → service
     (mapping can't 301; both domains serve the app, canonicalization can
     be app-side later). Retrieve the DNS records (CNAME
     ghs.googlehosted.com for www; A/AAAA set for apex) for step 8.
     Note: no CDN in this option — A4's immutable cache headers make browsers
     cache hard after first load, which is the optimization that matters at
     beta scale.
7. **Config for the new origin** (before DNS moves, both are additive-safe):
   - Append `https://www.gamedev.pl` to `WEB_ORIGIN` (comma-separated; app
     already splits) in `deploy.yml` + `infra/deploy-api.sh`, redeploy.
   - **[OWNER]** GCP console: add `https://www.gamedev.pl` to the OAuth
     client's Authorized JavaScript origins (console-only action; without it
     sign-in on the new domain fails with `origin_mismatch`). Keep the
     run.app origins too.
8. **DNS switch:**
   - Lower TTL on `www` (and apex) a day ahead.
   - Repoint `www` (and apex) from the GitHub Pages IPs (185.199.108–111.153)
     to the target issued by the step-6 wiring.
   - Execute step 5 (Pages domain removal + Pages shutdown) in the same
     window so nothing contests the cert.
   - Wait for the managed cert to go ACTIVE before announcing anything.
9. **Post-cutover verification on https://www.gamedev.pl:**
   - anonymous `GET /` → 200, splash renders (en + pl);
   - `GET /api/catalog` → 401; `GET /api/health` → 200;
   - no mixed-content / CORS errors in the browser console;
   - **[OWNER]** sign in with Google on the new domain → works, catalog loads;
   - a non-allowlisted account → 403 + waitlist CTA (once A2 is live);
   - static assets served compressed + long-cache on the new domain (and,
     if a CDN fronts the service, a repeat asset request shows a cache hit);
   - smoke gates in `deploy.yml` still green (they probe the run.app URL —
     optionally add a www probe once DNS is stable).

## Phase C — invites & running the beta

10. **Invite flow (deliberately manual v1, per splash plan):** owner reads the
    `waitlist` collection in the Firestore console → adds chosen emails to
    `BETA_ALLOWED_EMAILS` (safe now that `email_verified` is enforced) or uids
    to `BETA_ALLOWED_UIDS` → redeploy (or asks Claude to). Batch invites to
    avoid a redeploy per person. v2 (only if volume demands): store-backed
    allowlist, no redeploy per invite.
11. **Ops floor for real users:**
    - Cloud Run error-rate / 5xx alert (email is enough at this scale);
    - keep scale-to-zero (cold starts acceptable for beta);
    - Firestore: no backup automation needed yet at this data volume —
      revisit before public launch.
12. **Announce** to the invited circle only — the domain itself will leak
    (that's fine; splash + waitlist is the designed landing for strangers).
13. **Repo housekeeping — merge to master (only after cutover is verified
    stable; owner asked for explicit timing):** nothing launch-side blocks
    on it — the default branch and deploy.yml trigger are already
    `the-new-gamedevpl`, and `master` holds only the doomed old-site source.
    Doing it mid-launch would churn workflow triggers at the worst moment.
    After cutover: merge `the-new-gamedevpl` → `master`, flip `deploy.yml`
    (and `ci.yml`) triggers to `master`, set `master` as default branch
    again, then retire the feature branch.

## Exit criteria for "closed beta launched"

- www.gamedev.pl serves the new app with a valid cert; old-Pages claim
  released; apex redirects.
- Sign-in verified on the new origin by the owner.
- Wall verified on the new origin (anonymous data routes 401; splash 200).
- At least one non-owner invitee signed in and played/submitted.
- Waitlist accepting entries (if A2 shipped before cutover).

## Explicitly out of scope here

- Going public (`PRIVATE_BETA=false`) — separate decision, hard-gated on
  content-safety slice 1 per `content-safety-plan.md`.
- Custom-domain email, analytics, SEO — nothing indexes a walled beta.
- Migrating/redirecting old-site URLs — the old site is deleted outright
  (step 4); old deep links will 404 on the new app, which is accepted.
