# Path routing — replace hashbang deep links

> Status: **📋 Plan** — approved shape for implementation. No code change lands until
> this doc's open decisions are settled (especially multiplayer join).
>
> Goal: stop using `#/…` fragment routes. Deep links should be real paths
> (`https://www.gamedev.pl/play/sky-dodge`), shareable, bookmarkable, and refreshable.

---

## Why

Hash routing (`#/play/<slug>`, `#/status/<token>`, …) was chosen early so a static host
could serve one `index.html` without SPA fallback. That constraint is gone:

- Production is one Cloud Run service that already serves the web dist and has an SPA
  fallback (`apps/api/src/app.ts` → `setNotFoundHandler` → `index.html`).
- Vite's dev server already falls back to `index.html` for unknown paths.
- Hash URLs are ugly in the address bar, worse in shared/copy-pasted links, and fight
  analytics, Referer-based tooling, and "open in new tab" expectations.

This is a routing refactor only. It does **not** introduce React Router, change the
view tree in `App.tsx`, or touch the sandboxed game iframe contract.

---

## Current surface (inventory)

Custom router in [`apps/web/src/router.ts`](../apps/web/src/router.ts) — no React Router.
`App.tsx` listens to `hashchange` and stores an `AppRoute` discriminant.

| Hash today              | Meaning                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `#/` / empty            | Home (catalog + create)                                                              |
| `#/play/<slug>`         | Published game theater (permalink)                                                   |
| `#/draft/<slug>`        | In-progress game watch (read-only share)                                             |
| `#/status/<token>`      | Submission status (poll token)                                                       |
| `#/join/<code>/<token>` | Multiplayer guest join (QR). Token is **intentionally** in the fragment — see § Join |
| `#/health`              | Unlisted operator telemetry (API still gates admin)                                  |

**Call sites that emit or consume hashes** (non-exhaustive but complete enough to drive the PR):

| Area                       | Files / notes                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Router + builders          | `apps/web/src/router.ts`, `router.test.ts`, `mp/protocol.test.ts`                   |
| App navigation             | `App.tsx` (`navigateHash`, `hashchange`), `App.catalog.test.ts`                     |
| Links in UI                | `NavHeader.tsx`, `DraftView.tsx`, `GameHealthView.tsx`, `SubmissionStatusView.tsx`  |
| In-app notifications       | Stored `link` field (`#/play/…` or `#/status/…`); bell uses `href={n.link}`         |
| Email + Web Push           | `apps/api/src/notify.ts` joins `APP_BASE_URL + '/' + link` → absolute URL           |
| Multiplayer QR / join path | `apps/api/src/mp.ts` → `joinPath: /#/join/...`                                      |
| Service worker             | `apps/web/public/sw.js` `notificationclick` already `client.navigate(url)`          |
| SPA serving                | Fastify static + not-found → `index.html` (comment still says "hash-routed")        |
| Docs                       | `steel-thread-plan`, `multiplayer-plan`, `notifications-plan`, `mobile-app-plan`, … |

Section anchors like `#studio` in `SplitHero.tsx` are **not** app routes; leave them alone.

---

## Target URL map

Same path shapes, without the `#`:

| Path              | `AppRoute`                                   |
| ----------------- | -------------------------------------------- |
| `/`               | `{ view: 'home' }`                           |
| `/play/<slug>`    | `{ view: 'play', slug }`                     |
| `/draft/<slug>`   | `{ view: 'draft', slug }`                    |
| `/status/<token>` | `{ view: 'status', token }`                  |
| `/health`         | `{ view: 'health' }`                         |
| `/join/<code>/…`  | `{ view: 'join', code, token }` — see § Join |

Slug validation stays as today: lowercase kebab-case only
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Unknown / invalid paths → home (same as today).

**Reserved:** anything under `/api/*` is the API. Do not add SPA routes that collide with
static files (`/assets/*`, `/icons/*`, `/sw.js`, `/offline.html`, …).

---

## Recommended approach: keep the custom router, switch to History API

Do **not** pull in `react-router` for six routes and a single top-level switch in `App.tsx`.
Replace hash plumbing with pathname plumbing:

1. **`parsePathRoute(pathname)`** — same regexes as `parseHashRoute`, but on
   `location.pathname` (no leading `#`).
2. **Builders** rename `playHash` / `draftHash` / `statusHash` → `playPath` / `draftPath` /
   `statusPath`, returning `/play/…` etc. (leading slash, no hash).
3. **`navigate(path)`** — `history.pushState(null, '', path)` then `setRoute(parsePathRoute(path))`.
   Use `replaceState` when migrating a legacy hash or correcting a trailing slash.
4. **`popstate` listener** instead of `hashchange`.
5. **Initial route** — `parsePathRoute(window.location.pathname)`, after optional legacy
   hash migration (below).

This keeps the existing `AppRoute` type and all the stage/theater effects that key off
`route.view`.

### Vite / Cloud Run

- **Dev:** Vite already serves `index.html` for unmatched paths; no config change expected.
- **Prod:** SPA fallback already exists. Update the comment that claims the app is
  hash-routed; behaviour stays "non-`/api` GET → `index.html`".
- **Canonical host redirect** already preserves path + query (`canonical-host.test.ts`).

---

## Legacy hash → path migration (must ship with the cutover)

Bookmarks, push payloads, emails, and in-app notification rows will keep pointing at
`#/…` for a long time. On every cold load of the SPA:

```
if location.hash matches #/play|draft|status|join|health|/:
  replaceState to the equivalent path
  clear the hash (replaceState to pathname only)
```

Also accept old hashes if somehow still present after load (defensive one-shot on boot is
enough; no permanent dual router).

**In-app notification `link` field:** when rendering the bell, normalize
`#/play/x` → `/play/x` (and same for status/draft). New writes from `notify.ts` store the
path form (`/play/…`, `/status/…`). No Firestore backfill required if the client normalizes
on read.

**Email / push absolute URL join:** today
`` `${appBaseUrl}/${notification.link}` `` with `link = '#/play/…'` accidentally works
(`https://www.gamedev.pl/#/play/…`). With path links it would produce a double slash
(`…pl//play/…`). Fix the join once:

```ts
function absoluteAppUrl(base: string, path: string): string {
  return new URL(path.startsWith('/') ? path : `/${path}`, base.endsWith('/') ? base : `${base}/`).toString();
}
```

Use that helper for email CTAs and push `url` payloads.

---

## Join route — open decision (security)

[`docs/multiplayer-plan.md`](./multiplayer-plan.md) §4.3 put the room token in the
**fragment on purpose**: fragments are not sent to the server, so they stay out of access
logs and `Referer` headers. The credential is only presented later in the WebSocket
`hello` frame body.

Moving join to a pure path (`/join/<code>/<token>`) **does** put the token on the request
line for the SPA document GET. That is a real tradeoff.

### Options

| Option                         | URL shape                        | Pros                                                                         | Cons                                                                                                                                 |
| ------------------------------ | -------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Hybrid (recommended)**    | `/join/<code>#<token>`           | Proper path for the room; token stays out of logs/Referer; QR still one scan | Slightly unusual; parser must read pathname + hash                                                                                   |
| **B. Full path**               | `/join/<code>/<token>`           | Uniform with other routes; simplest code                                     | Token in Cloud Run access logs + possible Referer leakage to third parties if the join page ever loads external assets with referrer |
| **C. Keep hash-only for join** | `/#/join/<code>/<token>` forever | Zero security change                                                         | Leaves a hashbang island; contradicts the goal                                                                                       |

**Recommendation: Option A.**

- Path: `/join/K7M3QP`
- Fragment: raw token only (not `#/join/…` again) — e.g. `https://www.gamedev.pl/join/K7M3QP#<token>`
- `parsePathRoute` + a small `readJoinTokenFromHash()`; builders for QR use that shape.
- Update `mp.ts` `joinPath` accordingly.
- Document in `multiplayer-plan.md` that the _credential_ remains fragment-scoped; only the
  room code is a path segment.

If product prefers uniform URLs over log hygiene, Option B is acceptable **iff** we also
set `Referrer-Policy: no-referrer` on the document (or at least the join view) and accept
short-lived tokens in private Cloud Run logs.

**Status tokens** (`/status/<token>`) are already treated as shareable URLs and are not in
a fragment today in spirit (they're "secret URLs"). Putting them on the path is fine and
matches how creators already bookmark them; no special case.

---

## Implementation slices (suggested PR order)

Small PRs, each green under the usual gate
(`type-check && lint && test && build`).

### PR 1 — Router core + App wiring + legacy redirect

- Rewrite `router.ts` / tests: `parsePathRoute`, path builders, join hybrid if A.
- `App.tsx`: `popstate`, `navigate`, initial parse, boot-time hash→path migration.
- Update UI `href`s (`NavHeader`, `DraftView`, `GameHealthView`, `SubmissionStatusView`).
- Update web tests that poke `window.location.hash`.

### PR 2 — API emitters (notifications, MP join, comments)

- `notify.ts` path links + `absoluteAppUrl` helper; fix tests.
- `mp.ts` `joinPath` shape; tests.
- Comment / JSDoc cleanups in `store.ts`, `pusher.ts`, `submissions.ts`.
- SPA fallback comment in `app.ts`.

### PR 3 — Docs + plan status

- Flip this doc to ✅ Done when merged behaviour matches.
- Patch references in `multiplayer-plan.md`, `steel-thread-plan.md`,
  `notifications-plan.md`, `mobile-app-plan.md`, `improvement-loop-plan.md`,
  `creator-experience-review.md`, `roadmap.md` (hash → path wording).
- Link from [`docs/README.md`](./README.md).

Optional follow-up (not blocking): strip any remaining `#/` mentions in older archived
plans for consistency.

---

## Out of scope

- React Router / file-based routing / SSR / Remix.
- Changing slug rules, status-token format, or API paths.
- SEO meta per game (nice later; paths make it _possible_, this plan does not add it).
- CDN cache rules beyond what closed-beta launch already describes — `index.html` stays
  `no-cache`; only `/assets/*` is immutable.
- Migrating historical Firestore notification documents (client normalizes instead).

---

## Test plan

- Unit: every former hash case in `router.test.ts` / `protocol.test.ts` for paths; legacy
  `#/play/x` → `/play/x` migration helper.
- Component: catalog / status / theater tests drive `history.pushState` / `pathname`
  instead of `location.hash`.
- API: notify + mp joinPath assertions for new shapes; email/push URL has a single slash.
- Manual smoke after deploy:
  1. Open `/play/<known-slug>` cold (hard refresh) → theater.
  2. Open old `#/play/<slug>` → address bar becomes `/play/<slug>`, theater opens.
  3. Submit a game → lands on `/status/<token>`; refresh keeps status view.
  4. Share `/draft/<slug>` in a private window → read-only draft.
  5. Host a party → scan QR → guest controller still joins (Option A fragment token).
  6. Click an old in-app notification with `#/play/…` → still navigates.
  7. Web Push click (if subscribed) opens the path URL in an existing tab via `sw.js`.

---

## Risks

| Risk                          | Mitigation                                                          |
| ----------------------------- | ------------------------------------------------------------------- |
| Join token logged if Option B | Prefer Option A; else Referrer-Policy + short TTL                   |
| Stale emails/push with `#/…`  | Boot-time hash migration forever (cheap)                            |
| Double-slash absolute URLs    | `absoluteAppUrl` helper + tests                                     |
| Accidental `/api` collision   | Route table stays outside `/api`; SPA fallback already skips `/api` |
| SW caches wrong shell         | Unchanged — SW still does not cache `index.html`                    |

---

## Decision checklist (fill before coding)

- [ ] Join shape: **A** hybrid / **B** full path / **C** hash island — default **A**
- [ ] Keep custom History-API router (yes) vs adopt React Router (no, unless scope grows)
- [ ] Legacy hash redirect: permanent soft-compat (yes)
- [ ] Notification storage: write paths; normalize on read (yes)
