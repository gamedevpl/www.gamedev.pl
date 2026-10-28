# Local Play code updates

Browser Play can replace behavior inside an opted-in GameKit instance. With automatic
updates selected, compatible edits preserve the running iframe, canvas, round, setup
services, RNG objects, input and pause state. The GameKit compiler declares eligibility
through `GAME.json.hot` and produces a separate registration bundle. Older projects
continue through the existing state-transfer/restart flow.

The behavior module and its eligible dependencies participate. A resource-capable Kit
can also opt names and adapters into `GAME.json.hot.resources`: embedded PNG/WebP images,
generated `GAME.json.theme`, native 2D post effects and declarative input listeners.
The CLI requests resource protocol 2; older Kits continue with protocol 1. A newer Kit
used by an older CLI fingerprints resource-enabled behavior as boot code, requiring fallback.

Resource preparation decodes images and compiles/uploads native GPU candidates while
the previous game continues. It precedes the live-operation commit fence. Hashes cover
the exact embedded resource snapshot; assets remain in the HTML archive once, without
duplicating them in the behavior artifact. Commit replaces code and resource bindings
together, then paints without advancing simulation. Cancellation, stale epochs, decode,
shader and upload failures release candidate allocations and keep the old version.
Boot/service, menu/editor, backend, buffer-layout, image-name/dimension or schema changes
require the fallback flow. Images accessed as raw elements or pixel copies also require
fallback; use stable `images.ref(name)` or `draw.image(name, …)` for managed assets.
If state cannot
be restored safely, Play keeps the shown game and offers **Restart with update**.
Compilation or preparation errors keep the previous behavior. After a committed
refresh fails, Play reports the actual new revision as unavailable and offers restart.
Later uncaught errors pause the updated instance and remain visible in its journal.
Resource fallback requires complete validated persistence even for a manual update.
WebGL context loss freezes execution and offers checkpoint recovery with **Apply update**
or an explicit restart. Recovering into a new iframe requires releasing an agent lease.
Existing audio contexts/voices remain boot-owned; audio-bank or graph changes use fallback.

Code executes inside `sandbox="allow-scripts allow-pointer-lock"`. The host validates
the candidate hash, boot fingerprint, source, expected revision and epoch. Script
registration is bounded and synchronous. Commit results are retained by transaction
ID, so a lost reply is queried before another commit is attempted.

A live agent operation, including its screenshot, excludes commit. An idle control
lease survives compatible updates and continues receiving heartbeats. The same task
must call `game_observe` after the code changes before it can act again. Human reclaim,
disconnect and lease expiry retain their existing revocation rules. Replacing an
iframe requires releasing control and acquiring it again in the new instance.

Each commit starts a new journal recording with the same runtime ID, increasing
build epoch, previous recording ID, transition ID, frame and simulation tick. A → B → A
has three epochs even though the first and last code hashes match. Sealed queues retain
their original recording/code binding until acknowledged. `game_journal_code` resolves
each recording against its immutable assembled HTML, not current files. The HTML
contains the compiled behavior and retained boot code; it is not an authored-source
snapshot or deterministic replay.
Resource protocol 2 segments also record `resourceHash`; preparation outcomes stay in
the old segment. The immutable HTML binds the exact code, generated theme and asset bytes.

Transactions and recording queues have a 256-instance limit per running tab/recorder.
The code archive and journal retain their existing storage limits. Capacity exhaustion
is explicit; it must not attribute new state to another code version. HMR bundles are
limited to 1 MB, with bounded transport reads. Raw preview and phone surfaces keep
their existing update behavior; this integration targets browser Play's workbench.

HMR details remain local. Aggregate CLI telemetry does not currently answer how often
updates preserve a running game; this is a named instrumentation gap. Source code, state and recording identifiers are not sent to the telemetry stream.
