# Closed-beta launch on www.gamedev.pl

> Status: plan (2026-07-23, not yet actioned). This is the umbrella plan for
> pointing www.gamedev.pl at the new app and inviting beta users. It sequences
> existing approved plans (`closed-beta-splash-plan.md`,
> `content-safety-plan.md`, `creator-qa-plan.md`) plus the domain cutover,
> which is new scope. Owner decisions required are marked **[OWNER]**.

## Current state (verified live 2026-07-23)

- New app live on Cloud Run: `https://gamedev-app-334141807880.europe-central2.run.app`
  (project `gamedevpl`, region `europe-central2`, service `gamedev-app`).
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

1. **Dependency security bumps** — fastify Content-Type body-validation
   bypass (HIGH, prod-relevant: public `/api/auth/*` routes parse JSON);
   vitest/vite/launch-editor while in the lockfile. Lockfile discipline:
   `npm install --package-lock-only` must produce zero diff vs `npm ci`.
   Confirm Dependabot alerts close after push.
2. **Waitlist** — per `closed-beta-splash-plan.md`: `POST /api/waitlist`
   (ID token re-verified server-side), `waitlist/{uid}` upsert, 403 sign-in →
   join CTA. This is what makes a closed beta on a public domain work:
   visitors who find the site can request access instead of hitting a dead
   end. Privacy invariants in that plan are hard requirements.
3. **Content-safety slice 1 (regex layer) + 1b (Vertex layer)** — per
   `content-safety-plan.md`. The hard sequencing rule there only blocks
   `PRIVATE_BETA=false` (going public), not the closed beta itself.
   **[OWNER]** decide: invite only personally-trusted people before slice 1
   lands, or hold invites until slice 1 is live. Recommendation: slice 1
   before any invitee the owner wouldn't vouch for.
4. **Static-serving fixes** (small, self-contained; measured live
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
6. **Choose + build the domain wiring.** Verify first whether Cloud Run
   domain mapping supports `europe-central2` (believed NOT supported —
   domain mappings are region-limited preview). Options, pick one — CDN for
   static assets is a selection criterion, not an afterthought (depends on
   A4's cache headers being live):
   - **Global external HTTPS LB + serverless NEG** + Google-managed cert —
     canonical, ~few $/mo, gives a static IP for DNS; enable **Cloud CDN**
     on the backend so `/assets/*` serves from Google's edge and most static
     requests never reach Cloud Run (also shrinks cold-start exposure).
   - **Firebase Hosting rewrite to Cloud Run** — lighter/cheaper, CDN built
     in for free, but adds a second serving layer in front of the app.
     Also handle the apex: `gamedev.pl` → 301 to `https://www.gamedev.pl`.
7. **Config for the new origin** (before DNS moves, both are additive-safe):
   - Append `https://www.gamedev.pl` to `WEB_ORIGIN` (comma-separated; app
     already splits) in `deploy.yml` + `infra/deploy-api.sh`, redeploy.
   - **[OWNER]** GCP console: add `https://www.gamedev.pl` to the OAuth
     client's Authorized JavaScript origins (console-only action; without it
     sign-in on the new domain fails with `origin_mismatch`). Keep the
     run.app origins too.
8. **DNS switch:**
   - Lower TTL on `www` (and apex) a day ahead.
   - Repoint `www` from the GitHub Pages IPs (185.199.108–111.153) to the
     LB IP / Firebase target per step 6.
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
     if Cloud CDN is on, a second request for the same asset shows a CDN
     cache hit);
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
