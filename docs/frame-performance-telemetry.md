# Frame performance telemetry

The existing play stream collects performance context for published games in both
catalog lanes. It uses the same `alive` heartbeat, batching, API, session limits,
Firestore partition and 90-day retention. No per-frame network requests are added.

`game_opened.device` records a coarse device class, system family, browser family
and major version, display dimensions in CSS pixels, host display DPR, and available CPU/memory buckets. The browser derives these
locally; the raw user-agent, exact device model, GPU strings, account identifiers,
IP and persistent identifiers are never stored. Desktop-mode iPad detection is
heuristic. CPU/memory values describe browser-reported buckets, not benchmarked
hardware. Missing values remain unknown; a Mac cannot reliably identify an M4.

`game_opened.artifactVersion` is SHA-256 of the exact served HTML, computed once per
cached document. Store builds, repository snapshots and assembled fallbacks share
this identity. It describes content, not a source commit. Draft/review traffic must
remain excluded; an in-session remix suspends published-game tracking.

`alive.performance` version 1 includes:

- Actual window duration, eight frame-interval histogram bins and maximum gap.
- Bin upper bounds: 17, 25, 34, 50, 100, 250, 1000 ms; final bin is greater than 1000.
- Viewport dimensions, orientation, device pixel ratio, canvas buffer dimensions,
  and displayed canvas dimensions in CSS pixels.
- Lifecycle state and rendering backend when exposed in GameKit's snapshot.
- GameKit's presented-frame counter delta when its harness is available.

The histogram measures the iframe's independent rAF cadence. It does not measure
GPU execution time or prove that pixels changed. The optional `renderedFrames`
measures the GameKit loop's presented-frame count; a frozen game can therefore have
healthy rAF cadence and zero presented frames. It is not available for arbitrary
older game loops. Neither metric changes simulation, quality or game behavior.
Canvas layout is read once per heartbeat, not every frame. The primary/largest canvas
is measured; multi-canvas games may have additional unmeasured rendering costs.

The first window and windows spanning host activity, visibility, pause, resize,
DPR, canvas-buffer or lifecycle transitions are marked invalid. Activity commands
use the existing document-bound channel. Invalid windows are retained for diagnostics
but excluded from performance aggregates and FPS. Windows longer than 11 seconds
are outside the supported measurement range; background/suspension artifacts must
not become low-FPS game findings. Unsupported optional payloads are dropped without
rejecting an otherwise valid legacy heartbeat.

The operator's existing `GET /api/admin/telemetry/health?days=N` adds `performance`:
aggregates grouped by slug, content version, normalized device and rendering context.
It exposes observed duration, session/window counts, cadence FPS, optional presented
FPS, histogram percentile upper bounds, maximum gap and counts above 100/250 ms.
It returns no session identifiers or raw event rows. A null percentile means there
were no intervals or the requested percentile is above the final finite bin; the
panel distinguishes these. FPS is duration-weighted, and histograms are summed,
not averages of per-window percentiles. Groups cap at 2000 and report truncation;
existing partition-scan truncation still applies. Coverage counts concern observed
sessions, not games with no traffic. Daily legacy-health rollups advance to version 3
because reviewer and active-agent sessions must be excluded; device breakdowns use the existing bounded raw
scan, not a new storage collection or daily-rollup shape.

Events already carry server-anchored timestamps and `msSinceOpen`. Existing progress
landmarks can be correlated within their anonymous game session for later moment
analysis. The first implementation collects this evidence; it does not create alerts,
optimize games, automatically diagnose causes or claim device-wide performance from
one session. Changing quality settings requires a future explicit bounded contract;
backend and buffer size are observed now, with unknown values kept unknown.

Validation covers the executable bridge, hostile optional inputs, legacy compatibility,
interleaved progress/FPS calculation, device classification, grouped aggregation,
publication-lane content identity and the existing platform gate.

## Reviewer cohorts

The API stamps `reviewer: true` on play and visit events from authenticated reviewer
or admin accounts, using existing resolved request identity. Clients cannot set this
flag. No UID, token, IP or cross-stream identifier is stored. Unflagged events include
ordinary players, anonymous sessions and legacy data; historical reviewer status
cannot be reconstructed.

Published play remains instrumented when agent tools are available. Host events
recorded while the agent panel is open carry `agentMode: true`, evaluated at capture
rather than batch-flush time. Performance excludes those events, while retaining
ordinary play before/after agent mode. Transition windows remain invalid.

`GET /api/admin/telemetry/health?days=7&performanceReviewers=include` accepts:

- `include` (default): players and reviewers, in separate device/render groups.
- `exclude`: only unflagged player/legacy sessions.
- `only`: reviewer sessions.

Each performance group includes `reviewer: boolean`. Coverage counts use the selected
cohort after active-agent events are removed. The operator panel offers the same
filter. Health, play engagement, visit funnels and activity trends always exclude
reviewer sessions/visits; play health also excludes entire sessions containing
active-agent events. The performance filter does not change those business metrics.

Any flagged event classifies its whole session/visit within the scanned input,
including rows captured before sign-in. Bounded reads and UTC-day rollups may miss
flags outside their slice; truncation and legacy/unflagged status remain caveats.
Role filtering uses the existing reads and existing per-request authentication.

Creator owners can read these aggregates in Studio. The MCP read is implemented
but disabled by default pending its disclosure rollout. See
[creator performance access](creator-game-performance.md) for auth, filters and limits.
