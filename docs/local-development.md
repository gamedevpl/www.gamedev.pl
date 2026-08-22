# Local development

The goal of this page: from `git clone` to playing a game and submitting a spec, in about
five minutes, with no accounts, no API keys and no cloud project.

```bash
npm install
npm run dev
```

Then open **http://localhost:5173** — not `127.0.0.1:5173`. Vite binds to `localhost`
(IPv6 `::1`) only, so the numeric address refuses the connection. The API runs at
`127.0.0.1:3001` and Vite proxies `/api` to it.

## What works without any configuration

| Flow              | How it works locally                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| Browse the arcade | Games come from a local directory instead of the games repo (see below)            |
| Play a game       | Assembled and sandboxed by the same code path production uses                      |
| Sign in           | `POST /api/auth/dev` mints a session for a synthetic `dev:local` account           |
| Create a game     | The submission is accepted and gets a status page; the issue only exists in memory |
| Everything else   | Users, quotas and telemetry live in an in-memory store; email and push are no-ops  |

Nothing here talks to GitHub, Google or Google Cloud.

## Where games come from

The API picks the first of these that applies:

1. **`GITHUB_TOKEN` is set** — the real games repo over the GitHub API. This is production.
2. **`GAMES_LOCAL_DIR` is set** — that directory, read from disk.
3. **A sibling `../www.gamedev.pl-games` checkout exists** — the real catalog, locally.
4. **Otherwise** — the two fixture games in `apps/api/fixtures/games-repo`.

The startup log says which one you got. Cases 2–4 all run through
`apps/api/src/local-games-repo.ts`, which fakes GitHub at the `fetch` boundary rather than
reimplementing the client — so catalog parsing, TypeScript bundling and asset embedding are
the same code that runs in production, and a bug you find locally is a real bug.

The fixture games are deliberately small and self-contained: enough to browse, play,
restart and share, not a substitute for the catalog. If you need the real thing and have
access to the games repo, clone it next to this one and restart.

## Signing in

Real Google OAuth needs a client ID with your origin authorized, which a contributor has no
way to obtain. Instead:

```bash
curl -X POST http://localhost:5173/api/auth/dev -c cookies.txt
```

That sets a session cookie for `dev:local`. Pass `{"uid":"someone-else"}` to get a second
account — useful for testing anything that involves two users. The endpoint answers **404 in
production**; it exists only outside it, and mints a session with no credential at all.

This is the right tool for local work, including for a coding agent in a cloud VM: it runs
against the in-memory store and the mock generator, so it touches nothing real. Testing the
**deployed** site is a different problem with a different answer — see
[`agent-access-tokens.md`](./agent-access-tokens.md).

## Running the checks

```bash
npm run lint && npm run type-check && npm run test
```

All three must be clean before a change is finished. `npm run build` is the production
build if you want to check it compiles the same way CI will.

## Things that will surprise you

- **Nothing is generated on demand by this app.** Games are written by coding agents in
  the games repo, or delivered over MCP by a creator's own agent.
- **A submitted spec never progresses past "queued" locally.** No agent is watching, so
  there is no pull request to find. That is the honest local behaviour, not a bug.
- **State evaporates on restart.** The in-memory store is not persisted; production uses
  Firestore.
- **Games render in a sandboxed iframe with no `allow-same-origin`.** This is a safety
  invariant, not a detail — synthetic clicks from automated browsers cannot reach inside it,
  so verify game input on a real device or through the player bridge.

See `.env.example` for every variable and what it turns on.
