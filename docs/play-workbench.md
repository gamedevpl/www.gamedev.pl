# Local Play workbench

In an interactive terminal, `gamedevpl` opens a browser home with Open and Create.
`gamedevpl play [slug]` opens the matching game (the current checkout when omitted);
`gamedevpl create [idea]` opens a separate creation conversation. Opening home or
choosing Create without submitting an idea does not start an agent. Once a checkout
opens, Play starts automatically; required recovery and account questions appear in
that same browser session.

Use `gamedevpl --terminal`, explicit `repl`, or `connect` for terminal conversation.
`play --preview` retains raw preview. JSON, redirected/non-TTY and `play --stop` keep
their previous behavior. Explicit `create --play` and `play --edit` also launch a
browser without a TTY; they cannot be combined with JSON, stop or raw-preview flags.
`--no-open` prints the complete session URL instead of opening it.

The launcher exits and the session stays alive until **Commands → End session**.
Repeated launches resume the matching session without replaying a supplied idea.
New-game intake never inherits the launch directory's existing checkout. An unknown
legacy mutation blocks a new create until reconciled; existing recovery journals and
acknowledged game identities remain authoritative. Explicit `play --edit` without a
slug retains the legacy directory journal for recovery. Interactive terminal `/play`
remains attached to that terminal's lifetime.

## Edit and operate

Chat opens a nonmodal React panel using the website's fonts, tokens and icons.
The game stays mounted and interactive outside the panel. Click the stage to return
keyboard control to the game; typing focuses the composer. The panel can move to
either side or close without resetting the game. Hide controls also closes the panels.

The composer names the session assistant as the initial recipient; builder selection
happens in the existing execution flow. During a local task it labels follow-ups as
queued for the assistant after that task. Opening Chat does not start an agent.
Commands are searchable and typing `/` offers the server's supported action map;
Tab completes a suggestion. Prompt history is shared with the terminal. Up recalls
history at the start of the composer; the history button also supports touch access.
Unsupported slash input stays in the draft with guidance rather than being sent as
an ordinary prompt. Current choices and questions keep their existing semantics.

Screenshot is beside the composer. Other attachments, Devices and Session details
open separate panels; build IDs and raw session output live in details. A missing
session credential and an offline controller have explicit recovery screens and never
appear as a new-game form. Use the complete CLI launch link to authorize a fresh tab.

The overlay shares the CLI controller, guarded command receipts, choice prompts and
follow-up queue. Requests made during an agent task are queued for a fresh task. Stop
cancels the observed task. Buttons invoke fixed CLI domain actions rather than a shell
endpoint. They expose checkout/connect, agent/model selection, status/logs/diff, checks,
source checkpoints, kit updates, pull, delivery, publish requests, takeover, account
information, draft sharing and round cancellation. Publication still follows the
platform's checks and authority rules. Native vendor permission flows that require a
terminal are explicitly unsupported in the detached browser runner; choose a supported
local adapter or perform that vendor handoff from a terminal.

The shared writer lock serializes local agent tasks, kit updates, pulls, deliveries and
checkpoint restoration across CLI processes. A crashed writer's lock is deliberately
not reclaimed from its PID alone: a detached child agent may still be running. Confirm
that the previous child exited before removing that lock. Other editors and arbitrary
shell commands do not participate in this lock.

## State-preserving updates

The shell uses the same game embedding bridge as Studio. Generated shell titles,
descriptions and padding are hidden; game menus and HUD remain intact. Logical canvas
proportions are preserved. Custom game HTML outside the supported shell contract may
still require game-source changes.

**Ask before update** is the default. A replacement pauses the old game, calls the
existing `__GAME_HARNESS__.snapshotState()`, loads a candidate frame, waits for readiness
and calls `restoreState(data)`. A rejected restore or timeout discards the candidate;
the original frame resumes without being reconstructed. **Restart with update** is an
explicit fallback. No JavaScript closures, GPU resources or arbitrary DOM are serialized.

A game using GameKit persistence must include its timers, RNG and progression in its
snapshot and reject incompatible state in `restoreState`. **Auto — preserve state**
also requires `validateState(data): boolean` and `canHotReload(): boolean` on the
harness; both old and new builds must support validation and the old build must report
a safe point. Otherwise the update waits for a manual decision. **Freeze build** holds
that browser's version. This is state-preserving replacement, not arbitrary code HMR or
an EditorKit persist-to-source editor.

## Evidence

Upload/paste images, attach a screenshot, export recent diagnostic input/error events,
or enable canvas recording before saving a recent clip. Media is stored in private local
files until the session ends. A request can carry eight attachments, each up to 16 MB;
the session budget is 128 MB and 100 artifacts. Generated names, SHA-256 hashes, build
revision, device and capture time keep evidence associated with the shown build.
References and intended game assets are separate choices; uploading does not change
source files. Draft text, staged references and uncertain command receipts survive a
browser refresh within the same session. Attachments remain staged until explicitly removed,
including across assistant clarification turns and subsequent tasks.

Screenshots use Studio's canvas/media composite; DOM overlays may be absent. Video
records the largest canvas without audio, in independent eight-second segments; the
latest completed segment is offered. Recording starts only after Enable recording.
MediaRecorder support and encoders depend on the browser. Diagnostic traces are **not
deterministic replays**. Local evidence requires a local builder; the intake service
receives text, and local file handles are attached to the selected task separately.
Agents must inspect supported media through their file tools and explicitly report
unsupported formats. No claim is made that every adapter can interpret video.

## Phone testing

Devices and Commands offer two access models:

- Existing authenticated platform Play/Studio links remain available for delivered
  builds. Delivery is explicit; local file saves do not publish or run a platform gate.
- **Test on phone** starts a separate listener on a selected private LAN interface.
  Scan its QR or open its link on the same trusted Wi-Fi. LAN transport is HTTP, not
  encrypted; use it only on a trusted network. It serves the selected build and accepts
  bounded reports, never editor commands, account credentials or checkout files.

Phone access expires after 30 minutes, can be revoked immediately, and is revoked when
the editor switches preview sources. The phone has independent game state and explicit
build updates. Reports include the phone's shown revision and, when available, its
screenshot and diagnostic trace. Reports appear on the desktop for review before the
creator sends them to an agent. No public tunnel or hosted storage service is installed.

## Recovery and limits

The private session journal records a launch instance, acknowledged game/round,
checkout and pending platform mutation. A successful create followed by failed setup
reopens the acknowledged game. Lost responses leave an **unknown outcome** that blocks
automatic retries of mutations; read-only status remains available. HTTP refusals can
be retried after fixing the cause. The journal does not invent server-side idempotency
or resume a vendor conversation. After a process crash, accepted tasks are never replayed.

A disconnected browser cannot start a process. Re-run the launcher in its original
working directory. If the old controller is still alive but unresponsive, the launcher
refuses a second writer. Journals currently live in the OS temporary directory and are
not a machine-reboot backup or an installed supervisor.

Startup locks record the launcher PID and creation time. An orphaned startup lock is
never removed just because its PID appears dead: inspect the adjacent journal/log and
confirm the launcher, controller and any child agent have exited. Only then remove the
exact lock directory printed by the launcher and repeat the same command. Legacy locks
without owner records require the same process inspection; if ownership is uncertain,
leave the lock in place. Failed owner-record writes clean up their own acquisition.

## Measurement and verification

Creation and editing reuse the existing CLI `first_turn`, `build_requested`,
`delegate_used`, delivery and publication events (creator funnel/return questions 4–5).
No attachment content, paths, pairing capabilities or prompts enter telemetry.
`play_requested` remains an opening request, not render evidence. Workbench adoption,
state-restore success, capture success and phone latency have no aggregate read-side yet;
these are explicit measurement gaps.

Tests cover command retries, attachment validation, source checkpoint recovery,
unknown remote outcomes and phone authority. Phone protocol tests bind only loopback.
Real device/codec behavior needs a physical phone; desktop narrow viewports do not prove
it. Browser integration checks use synthetic game/API fixtures and incur no paid agent
or platform changes.
