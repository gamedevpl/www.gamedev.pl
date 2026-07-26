# Personal access tokens — how an agent authenticates without a browser

✅ **Implemented.** Status: shipped on `master`.

## The problem

Sign-in is Google-only. A coding agent working in a cloud VM — Claude Code on the web,
Copilot's coding agent, a Codex container, CI — has no browser session, no Gmail
account, and no way to get one. So an agent could build and unit-test the product but
never _use_ it: every authenticated route (creating, revising, notifications, votes,
party mode) was unreachable, and every change to that half of the app shipped unverified
against the real thing.

`POST /api/auth/dev` solves this on a laptop and is deliberately 404 in production, so it
does not help against the deployed site.

## What was rejected, and why it matters

Three obvious options were considered first. Recording why they lost is the point of this
section — each is the thing someone will propose again in six months.

| Option                                      | Why not                                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A secret-gated "test login" route in prod   | It is a bypass whatever it is named. In an open-source repo, obscuring the name is worse than the bypass: the code is public either way, and the people misled are our own reviewers.         |
| Driving the Google login UI with Playwright | Google blocks automated sign-in (the "browser may not be secure" wall), datacenter IPs trigger CAPTCHA and phone verification, and it means putting a real Google password in every agent VM. |
| Email + password accounts                   | A real product feature, but it creates a password database — a permanent breach liability — plus registration, verification, reset and brute-force defense, all to solve a testing problem.   |

A token issued **to a real account** avoids all three: no bypass route, no Google
credential in the VM, no password to store. It is also simply the right credential for a
machine — the same reason GitHub removed password auth for automation and replaced it with
personal access tokens.

## Shape

```
gdpl_pat_<16 hex id>_<43 char base64url secret>
```

The id travels in the clear and is the lookup key; only the secret half is a credential.
What is stored is `sha256(secret)` in a top-level `accessTokens` collection — the token
itself is never written down, so a dump of the datastore yields nothing usable.

SHA-256 rather than argon2/scrypt is correct here and would be wrong for a password: the
secret is 256 bits of CSPRNG output, so there is no guessable input for stretching to slow
down.

Tokens live in their own collection rather than on the user document for a blunt reason:
`User` objects are returned to browsers by `/api/auth/me`, and a credential record riding
along on the user is one forgotten `delete` away from being served to a client.

## Properties

- **It is not a bypass.** The token authenticates _as an account_, with that account's
  tier, quota, and walls. There is no synthetic identity and no route that grants a
  session from nothing.
- **Revocation is a delete**, not a flag — the record _is_ the token's existence, so there
  is no revoked-but-still-verifiable state to get wrong. It takes effect on the next
  request, with no redeploy (unlike rotating an environment secret).
- **A token can never mint another token.** Issuing requires an admin _session_; a
  request authenticated with a token gets 404 from every operator surface, even when the
  token belongs to an admin. One leaked credential cannot become self-renewing.
- **Expiry is mandatory**, 90 days by default and 365 at most.
- **Bounded blast radius.** The worst case for a leaked token is someone acting as that
  one account — the same as a leaked session cookie, and strictly less than a leaked
  shared secret that mints sessions for anyone.
- **No new deployment secret.** Nothing new goes in Cloud Run's env or Secret Manager.

## The `bot:` namespace

Automation accounts use `bot:<handle>`, alongside `g:` (Google) and `dev:` (local).

Minting can create a `bot:` account but refuses to invent any other namespace. That rule
is a typo guard with teeth: without it, a mistyped `g:<sub>` would silently call an
account into being that never signed in, never passed the beta allowlist, and now holds a
working credential.

The prefix is also what lets product measurement tell bots from people — the creator
metrics exclude `bot:` submissions, and a token-authenticated request never records an
`activeDays` entry, so an agent on a cron cannot report perfect retention for an account
that is not a person.

## Issuing a token (operator)

Two paths, both calling the same `mintAccessTokenFor` so the rules cannot drift.

**CLI — no browser needed.** Talks to Firestore with your ambient gcloud credentials, the
same way `beta:approve` does. Check `gcloud config get-value project` first; there is no
dev/prod switch.

```bash
npm run token:mint   -w @gamedevpl/api -- bot:e2e --name "claude cloud vm"
npm run token:mint   -w @gamedevpl/api -- bot:e2e --name "ci" --days 30
npm run token:list   -w @gamedevpl/api -- bot:e2e
npm run token:revoke -w @gamedevpl/api -- <tokenId>
```

**HTTP — for anyone already signed in as an admin.** Requires an `ADMIN_UIDS` session;
answers 404 to everyone else, including a token-authenticated admin.

```
POST   /api/admin/access-tokens          {"uid":"bot:e2e","name":"ci","expiresInDays":30}
GET    /api/admin/access-tokens?uid=bot:e2e
DELETE /api/admin/access-tokens/<tokenId>
```

The token is readable exactly once, in the mint response. Nothing stores it — a caller who
loses it revokes and mints again.

## Using a token (agent)

Put it in the agent environment as `GAMEDEV_ACCESS_TOKEN`. **Never commit it**; it is in
the generated-game credential scanner, so a game that embeds one is refused at assembly.

**API calls** — send it as a bearer token:

```bash
curl -H "Authorization: Bearer $GAMEDEV_ACCESS_TOKEN" https://www.gamedev.pl/api/auth/me
```

**Driving a real browser** — the web app authenticates with cookies, so exchange the token
for a session first. `POST /api/auth/session` accepts only a token (never a cookie, so a
session can never launder itself into a fresh one) and returns the same cookie a Google
sign-in would:

```bash
curl -si -X POST https://www.gamedev.pl/api/auth/session \
  -H "Authorization: Bearer $GAMEDEV_ACCESS_TOKEN" | grep -i set-cookie
```

In Playwright, exchange once and hand the cookie to the browser context:

```js
const api = await request.newContext();
const res = await api.post('https://www.gamedev.pl/api/auth/session', {
  headers: { Authorization: `Bearer ${process.env.GAMEDEV_ACCESS_TOKEN}` },
});
const context = await browser.newContext({ storageState: await api.storageState() });
```

Chromium is preinstalled in most agent VMs (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`);
do not run `playwright install`.

## Where this does and does not apply

Testing **local changes** does not need a token at all — `npm run dev` plus
`POST /api/auth/dev` is faster, runs against the in-memory store, and touches nothing
real. Reach for a token when the thing under test is the deployed site: real Firestore,
the real generation pipeline, the real beta walls, the real CDN.

A token-authenticated bot **passes the private-beta wall** even though it is not on the
beta allowlist. That is intended, not a hole: the allowlist gates _sign-in_, and an admin
issuing a credential is an admission decision in itself.

## Operational notes

- **Firestore:** one new collection, `accessTokens`, keyed by token id. No index needed —
  the hot path is a point read, and listing filters by `uid` and sorts in memory. Consider
  a TTL policy on `expiresAt` so expired records self-clean; expired tokens are already
  refused at auth, so the policy is hygiene, not security.
- **Auditing:** every record carries `createdByUid` (an admin uid, or `cli:<user>`) and a
  day-resolution `lastUsedAt`, so you can see who issued a token and whether anything
  still uses it before revoking.
- **Rate limits:** `/api/auth/session` shares the auth limiter (20/hour/IP). Bearer-
  authenticated API calls are not separately limited beyond each route's own limits —
  exchange once and reuse the cookie rather than exchanging per request.
- **Rotation:** mint the new token, update the agent environment, revoke the old id. There
  is no window where both must be valid, so no coordination is needed.

## Code map

| File                                   | What it holds                                                       |
| -------------------------------------- | ------------------------------------------------------------------- |
| `apps/api/src/access-token.ts`         | Pure format, mint, hash, verify — no I/O                            |
| `apps/api/src/access-token-service.ts` | The shared issuance rules (namespace, cap, expiry)                  |
| `apps/api/src/access-token-routes.ts`  | Operator HTTP surface                                               |
| `apps/api/src/auth.ts`                 | Bearer resolution in the `onRequest` hook; `POST /api/auth/session` |
| `apps/api/scripts/access-token.ts`     | The `token:mint` / `token:list` / `token:revoke` CLI                |
