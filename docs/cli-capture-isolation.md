# Local capture isolation

A local capture uses a temporary browser profile and the Chromium sandbox.
The rendered game remains in an opaque-origin sandboxed iframe.

Capture waits for the document and its game frame to load. A task-local bridge
waits for GameKit readiness when present and two animation frames before notifying
the host. The browser checks the expected document URL and readiness before taking
the screenshot. A game that never becomes ready produces a timeout error, rather
than a successful capture of the initial blank page.

Capture loads through a local proxy that forwards only its fixed document URLs.
Initial captures use a srcdoc frame. Scripted captures also allow one fixed game
document URL with `capture=1` and the plan seed; the iframe keeps its opaque origin.
No other path, query, host or port is forwarded.
The proxy rejects tunnels and other requests. Chrome's temporary profile disables
non-proxied WebRTC UDP; remaining TCP transports must use the rejecting proxy.
Direct DNS resolution is disabled. These restrictions apply to the browser
process before any game document runs, including isolated iframe documents.

The profile preference is required for Chrome; the generic content switch alone
is insufficient. Chromium's [renderer preferences](https://github.com/chromium/chromium/blob/main/chrome/browser/renderer_preferences_util.cc)
read that profile setting. [RFC 8828 mode 4](https://www.rfc-editor.org/rfc/rfc8828.html#section-5)
describes using the HTTP proxy for WebRTC traffic.

Verification includes installed sandboxed Chrome, a local UDP listener and a
local TURN/TCP listener. Neither listener receives traffic, while the game script
runs and capture returns a valid PNG. Repeat the native check with:

```bash
GAMEDEV_CAPTURE_BROWSER_TEST=1 npm test -w @gamedevpl/cli -- src/capture-network-isolation.test.ts
```

The local MCP render regression also exercises `capture_game` through the real
browser, delays GameKit startup beyond the former fixed capture delay, and verifies
the returned PNG pixels, dimensions and revision:

```bash
GAMEDEV_CAPTURE_BROWSER_TEST=1 npm test -w @gamedevpl/cli -- src/local-preview-mcp.test.ts
```

Protocol mocks alone do not establish network isolation or browser rendering.

## Named moments and inline scenarios

`capture_game({mark: "opening"})` reads the current game's `CAPTURE.json`, starts a
fresh deterministic game, and replays its script to the first matching
`{"capture":"opening"}` step, including markers inside repeats. It stops before
later actions or assertions. An unknown mark returns the available names; it never
falls back to an unrelated screenshot. The CLI binds this read to the active game,
not an agent-supplied path. Media-only plan options do not affect the screenshot.

For an ad hoc view, the agent can supply a plan without changing the file:

```json
{
  "viewport": "desktop",
  "plan": {
    "seed": 42,
    "fps": 30,
    "maxFrames": 300,
    "script": [{ "press": { "key": "ArrowRight", "frames": 30 } }, { "wait": 10 }]
  }
}
```

Inline plans capture their final state. Supplying both `plan` and `mark` selects
the first matching mark in that inline plan. Neither input continues a previous
capture; each call starts fresh. With neither input, the initial-state behavior
remains unchanged. Poll `capture_status({jobId})` for the PNG, build revision,
plan source and hash, seed, fps, reached frame and bounded game snapshot.

The DSL supports `wait`, `tap`, `press`, `keyDown`, `keyUp`, `click`, `move`, `drag`,
`assert`, `waitFor`, `repeat` and `capture`. Pointers use normalized `{x,y}` or
`{fromMetadata:{x:"fieldX",y:"fieldY"}}` in canvas pixels. Conditions accept exactly
one of `equals`, `notEquals`, `greaterThan`, `greaterThanOrEqual`, `lessThan`,
`lessThanOrEqual`, or `oneOf`; `waitFor` also requires `maxFrames`.

Validation bounds requests and files to 64 KiB, nesting, expanded actions to
2000, fps to 1–60, simulated play to 600 seconds / 36000 frames, and browser
execution to 60 seconds. The existing task capture budget and single-job limit
apply to both modes. Failed assertions, exhausted frame budgets, missing harnesses
and timeouts return a failed job without an image.
The host cancels the whole scenario browser after 90 seconds, including startup
and screenshot encoding; individual browser commands stay within that budget.

The trusted interpreter is bundled into the CLI from the pure Creator Kit
`capture-plan.ts` interpreter; its source revision is recorded in
`apps/cli/src/capture-plan-runtime.ts`. Updates must preserve action order,
frame accounting, condition semantics and pointer interpolation. Update its
conformance tests with interpreter changes. The CLI never imports or executes
checkout-local capture scripts, npm commands or arbitrary agent JavaScript.
