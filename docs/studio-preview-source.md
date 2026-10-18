# Studio preview source invariants

`useStageSource` shares one fetched document between `CreatorStudioView`'s always-mounted
stage and its embedded thread. The version ribbon and thread must describe the same build.
Every selected source uses the same `embedGameHtml(withGameLocale(...))` preparation.

A refetch failure preserves the last good document. An assembly still finishing can return
409: do not mark its head/gate key loaded until the bounded retries are exhausted. A new
delivery supersedes the previous request, gets its own retry budget, and is fetched by
version so a cached fallback cannot be labeled as the new artifact. Completing verification
changes the fetch key even when no gate timestamp is reported.

An explicit history selection takes priority until a newer successful version arrives.
Reset that selection before committing a render on the new version or a game switch;
a passive effect allows a stale history frame and can fetch history for the wrong game.
Later deliberate history choices remain selected until another successful version arrives.
Failed checks preserve the choice.

Preview and channel freshness must use a shared clock (CE-12). Prefer `previewGate.ranAt`
for a gate preview and `playable.createdAt` for a channel build over the client fetch time.
Otherwise reloading an old preview can make it appear newer than a channel build that just
landed. Client observed-landing time is the fallback when the server omits the timestamp.
Unknown origin timestamps remain null and the ribbon renders them as unknown. A loaded
preview wins over channel unless the channel has a newer timestamp; conservatively retain
the preview when the channel's timestamp is absent or invalid. Staged-preview failures are
silent by design; see Workstream B2 in `studio-game-first-implementation-plan.md`.

Submission phase and agent presence describe different lifecycles. Successful submit marks
the agent ended, so a `submitted` round still starts verification before `gateProgress`
exists. The server's `gate_not_started` stall ends that starting state. A stored pending
preview in phase `building` with an ended or quiet agent alone does not prove an active
gate. Both Studio surfaces use the same awaiting-verification predicate. An older pending
delivery is history without a verification result, not a new check awaiting startup.
Actual gate progress takes priority over an agent stall.

The preview button and live fetch share `deliveredPreview`: the status must expose a
preview and its head must match a delivered version in history. Pending verification does
not prevent playing that saved candidate.

Slug history can place a newer sibling round before the token's current round. Sealing
must bind to `RecentBuild.jobId`, not row position. Game switches reset per-game stage
state; only the first resolution honors a Play deep link, while later switches start in Watch.
