# Live-editing latency instrumentation

Status: 🚧 measurement in place, no dashboard yet. This is Track 1 of the Studio
live-editing work — a prerequisite for the fast-lane rebuild changes (Track 2), not a
feature by itself.

## Why

Before Track 2 (an engine-bundle cache, a synchronous rebuild endpoint for the Code
surface, a faster owner-lane scheduler) changes anything about the rebuild pipeline's
latency, it needs to be measured. Every number in the design discussion — "the build
itself is ~50-150ms, the rest is GitHub contents-API fan-out and scheduler throttles" —
was inference from reading the code, not a measurement. This closes that gap.

## What is instrumented

### `GitHubClient.getGameSources` (`apps/api/src/catalog/github-client.ts`)

Returns an optional `timings` field on a successful assembly:

```ts
interface GameSourcesTimings {
  totalMs: number;
  baseReadMs: number; // game + engine file reads (index.html, game.ts, GAME.json, core.ts, ...)
  kitModulesMs: number; // GameKit module compile/transform for this game's declared modules
  audioMs: number; // sound asset resolution (.wav synth, then the sourced .mp3 fallback)
  musicMs: number; // music catalog + track selection; 0 when the game declares no music
  bundleMs: number; // core.ts transform plus the game's own esbuild graph
}
```

Absent on every test mock and on any early `null` return (a missing/invalid file) — only
the real client on a successful assembly populates it. Callers should treat it as
best-effort telemetry, never as a value the response depends on.

### `staged-preview.ts`'s `attempt()`

Logs one `info` line per successful assembly (`'staged preview assembled'`), with:

- `totalMs` — wall clock for the whole `attempt()` call
- `overlayMs` — reading staged/delivered/seed sources and flattening the overlay
- `getGameSourcesMs` / `getGameSourcesPhases` — the breakdown above
- `assembleMs` — `assembleGameHtml` (CSP injection, provenance marking, the credential scan)
- `storeWriteMs` — the Firestore `appendBuildPreview` + `pruneBuildPreviews` round trip

`StagedPreviewOptions.log.info` is optional — the real deployment wires `app.log`
(Fastify's Pino instance), so this needs no new plumbing. A caller without an `info` sink
(most tests) simply gets no timing lines; nothing else changes.

## What this does NOT instrument yet

- The remix code lane (`code-lane.ts`) — its own bench (`remix-lane-bench.ts`) already
  measures the model round trip, but that bench fakes GitHub at the fetch layer, so the
  network fan-out this doc is about is explicitly excluded from that number.
- The Code surface's client-side timers (`AUTOSAVE_MS`, `PREVIEW_DEBOUNCE_MS`,
  `STAGE_REBUILD_COOLDOWN_MS` in `CodeSurface.tsx`) and the server scheduler
  (`STAGED_PREVIEW_DEBOUNCE_MS`, `STAGED_PREVIEW_MIN_GAP_MS`) are already known constants,
  not something that needs measuring — they are the throttles Track 2 targets directly.
- There is no aggregation or dashboard over these log lines yet. Reading them today means
  reading Cloud Logging directly, filtered on `msg="staged preview assembled"`.

## Reading the numbers

Once real traffic has produced enough of these log lines, the questions Track 2 needs
answered are:

1. What fraction of `totalMs` is `getGameSourcesMs`, and within that, how much is
   `baseReadMs` + `kitModulesMs` + `audioMs` + `musicMs` (all engine/network-bound, and in
   principle fully cacheable per engine ref) versus `bundleMs` (esbuild, game-specific,
   must rerun per edit)?
2. Does `getGameSourcesMs` correlate with `manifest.modules.length` (more GameKit modules
   → more per-module network reads), which would confirm the module-compile phase as the
   dominant network cost rather than the base file reads?
3. Is `overlayMs` ever non-trivial? It should not be — flattening a few in-memory maps —
   and a surprise there would mean `readDeliveredSources` is doing more I/O than expected.

A per-ref engine cache (Track 2) should be judged by how much of `baseReadMs` +
`kitModulesMs` + `audioMs` + `musicMs` it removes on a cache hit, measured against these
same log lines rather than against the a-priori estimate this doc's numbers replace.
