# Local Play code updates

Browser Play can replace behavior inside an opted-in GameKit instance. With automatic
updates selected, compatible edits preserve the running iframe, canvas, round, setup
services, RNG objects, input and pause state. The GameKit compiler declares eligibility
through `GAME.json.hot` and produces a separate registration bundle. Older projects
continue through the existing state-transfer/restart flow.

Only the behavior module and its eligible dependencies participate. Boot/service,
menu/editor, CSS, asset or schema changes require the fallback flow. If state cannot
be restored safely, Play keeps the shown game and offers **Restart with update**.
Compilation or preparation errors keep the previous behavior. After a committed
refresh fails, Play reports the actual new revision as unavailable and offers restart.
Later uncaught errors pause the updated instance and remain visible in its journal.

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

Transactions and recording queues have a 256-instance limit per running tab/recorder.
The code archive and journal retain their existing storage limits. Capacity exhaustion
is explicit; it must not attribute new state to another code version. HMR bundles are
limited to 1 MB, with bounded transport reads. Raw preview and phone surfaces keep
their existing update behavior; this integration targets browser Play's workbench.

HMR details remain local. Aggregate CLI telemetry does not currently answer how often
updates preserve a running game; this is a named instrumentation gap. Source code, state and recording identifiers are not sent to the telemetry stream.
