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

| Flow               | How it works locally                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| Browse the catalog | Games come from a local directory instead of the games repo (see below)            |
| Play a game        | Assembled and sandboxed by the same code path production uses                      |
| Sign in            | `POST /api/auth/dev` mints a session for a synthetic `dev:local` account           |
| Create a game      | The submission is accepted and gets a status page; the issue only exists in memory |
| Everything else    | Users, quotas and telemetry live in an in-memory store; email and push are no-ops  |

Nothing here talks to GitHub, Google or Google Cloud.

## Where games come from

The API picks the first of these that applies:

1. **`GITHUB_TOKEN` is set** — the real games repo over the GitHub API. This is production.
2. **`GAMES_LOCAL_DIR` is set** — that directory, read from disk.
3. **A sibling `../www.gamedev.pl-games` checkout exists** — the real catalog, locally.
4. **Otherwise** — the two fixture games in `apps/api/fixtures/games-repo`.

The startup log says which one you got. Cases 2–4 all run through
`apps/api/src/catalog/local-games-repo.ts`, which fakes GitHub at the `fetch` boundary rather than
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
against the in-memory store and repo fixtures, so it touches nothing real. Testing the
**deployed** site is a different problem with a different answer — see
[`agent-access-tokens.md`](./agent-access-tokens.md).

## Testing WebMCP and the agent console

The Studio Code surface (`/studio/<slug>/code`) ships three ways for an agent to edit a
game's sources — see `apps/web/src/surfaces/studio/webmcp.ts` and
`CodeSurfaceAgentMode.tsx`. Only one needs a browser that speaks WebMCP; the other two work
in any browser today.

Unlike everything else on this page, the Code surface's own routes need a real
**`GAMES_STORE_BUCKET`** (a GCS bucket) — there is no in-memory fallback yet
(`apps/api/src/platform/app.ts`'s `gamesStore` is `undefined` without it), so every route
below 503s ("the Code surface is not configured on this deployment") until one is set.

1. Sign in (above), then create a game owned by that session so it has a Code surface to
   open:

   ```bash
   curl -X POST http://localhost:5173/api/submissions -b cookies.txt \
     -H 'content-type: application/json' \
     -d '{"title":"WebMCP test","concept":"A tiny game for exercising the agent console.","builder":"self"}'
   ```

   The response's `slug` is the game you just created. Without `GAMES_REPO_TOKEN` /
   `GITHUB_TOKEN` set (the no-key local setup this page assumes), a new game starts from an
   **empty** source tree — `createGameSeederFromEnv` skips round-0 generation entirely. Stage
   one file so there is something for `get_sources` to return and an agent to edit:

   ```bash
   curl -X PUT "http://localhost:5173/api/me/studio/games/<slug>/sources/stage" -b cookies.txt \
     -H 'content-type: application/json' \
     -d '{"path":"game.ts","content":"export function boot() {\n  // TODO: double jump\n}\n"}'
   ```

2. Open `http://localhost:5173/studio/<slug>/code` and click **Agent mode** in the header.
3. The modal's three sections map to the three paths:
   - **WebMCP toggle** — registers `document.modelContext` tools for a browser agent that
     reads them directly. No browser shipped a consumer as of this writing; the toggle is
     inert without one, which is also how to tell whether your browser has adopted it.
   - **Coding-agent key** — the existing creator-agent-key connector, for Claude Desktop/Code,
     Cursor or any other full MCP client: same tool names as the WebMCP path, over a real MCP
     connection instead of the page.
   - **Agent console** — a textarea + Run button, for a browser agent that can read the page
     and type but cannot call tools (e.g. a vision/DOM-driven agent). Works with zero setup.

### Driving the WebMCP path with webmcp-extension

[`webmcp-extension`](https://github.com/GoogleChromeLabs/webmcp-extension) is Google's
reference agent for WebMCP: a Chrome side-panel extension that reads a page's registered
tools (`document.modelContext.getTools()`), runs a prompt against them through an LLM (or
Chrome's on-device Prompt API, no key needed), and shows each call's schema and response.
It's the only way to exercise the WebMCP toggle end-to-end locally, since nothing else
consumes `document.modelContext` yet.

Needs **Chrome 155+** with `chrome://flags/#enable-webmcp-testing` turned on, and Node.js
22.18+ for the extension's own build tooling.

```bash
git clone https://github.com/GoogleChromeLabs/webmcp-extension
cd webmcp-extension
npm install
npm run build          # writes the extension to dist/
```

Pick one model backend:

- **A provider key (Google/OpenAI/Anthropic) or Ollama** — `cp .env.example .env`, set the
  key for `MODEL`, then `npm run server` in its own terminal before loading the extension.
- **On-device, no key** — skip `.env` and `npm run server` entirely. After loading the
  extension (below), turn it on in the side panel's **Settings → Model → On-device model**,
  and enable `chrome://flags/#prompt-api-tool-use` (a second flag, separate from
  `enable-webmcp-testing` above). The model downloads on first use.

Load `dist/` unpacked (`chrome://extensions` → Developer mode → **Load unpacked**), open the
Code surface tab with the WebMCP toggle on, open the extension's side panel on that tab, and
give it a prompt such as "add a double jump to this game". Watch it call `get_sources`, then
`patch_source_file` or `stage_source_file`, then `submit_sources` — the same contract
`apps/api/src/agent-surface/mcp-server.ts` exposes over real MCP, so a bug here is a bug
there too. `submit_sources` is hard-pinned to a preview build; nothing the extension does
can publish.

[`webmcp-types`](https://github.com/webmachinelearning/webmcp-types) is the TypeScript
package `webmcp.ts` itself imports (via `apps/web/src/vite-env.d.ts`) for the
`document.modelContext` / `WebMCP.*` types, and
[`webmcp-skills`](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-skills)
has patterns worth skimming before adding a new tool to `buildCodeSurfaceTools`.

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
