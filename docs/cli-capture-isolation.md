# Local capture isolation

A local capture uses a temporary browser profile and the Chromium sandbox.
The rendered game remains in an opaque-origin sandboxed iframe.

Capture waits for the document and its game frame to load. A task-local bridge
waits for GameKit readiness when present and two animation frames before notifying
the host. The browser checks the expected document URL and readiness before taking
the screenshot. A game that never becomes ready produces a timeout error, rather
than a successful capture of the initial blank page.

Capture loads through a local proxy that forwards only its fixed document URL.
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
