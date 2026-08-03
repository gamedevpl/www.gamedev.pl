# Gemini CLI extensions gallery — draft listing (NOT SUBMITTED)

**Status:** prepared for owner review. Do not publish.

## Sources (DOCUMENTED, read 2026-08-03)

- Releasing an extension: https://geminicli.com/docs/extensions/releasing
- Writing extensions: https://geminicli.com/docs/extensions/writing-extensions/
- Gallery: https://geminicli.com/extensions/
- Launch announcement: https://github.com/google-gemini/gemini-cli/discussions/10718

## How listing works (no form, no review queue)

1. A **public GitHub repo** with a valid `gemini-extension.json` at the repo root.
2. Add the repo topic **`gemini-cli-extension`**.
3. Google's crawler indexes tagged repos daily; the extension appears in the gallery
   automatically once validation passes. Ranking is by GitHub stars.
4. Users install with `gemini extensions install <github-url>`.

The manifest must sit at the **root** of a repo, so this monorepo cannot carry it.
Listing requires a small dedicated public repo (e.g. `gamedevpl/gamedev-pl-gemini-extension`)
holding only the manifest, a `GEMINI.md` context file, and a README — a manifest, not a
package, so compatible with the no-npm rule.

## Proposed `gemini-extension.json`

```json
{
  "name": "gamedev-pl",
  "version": "1.0.0",
  "description": "Build and improve browser games on gamedev.pl from Gemini CLI.",
  "mcpServers": {
    "gamedevpl": {
      "httpUrl": "https://www.gamedev.pl/api/mcp"
    }
  },
  "contextFileName": "GEMINI.md"
}
```

Note: Gemini CLI uses `httpUrl` for streamable HTTP (`url` means SSE). No credential in
the manifest — auth is OAuth discovery or a creator-supplied header, same rule as every
install surface.

## Out of scope

The **consumer Gemini app** has no third-party MCP or submission channel (integrations
are Google-negotiated partnerships). No action possible there.
