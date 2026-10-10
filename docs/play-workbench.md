# Local Play workbench

In an interactive terminal, `gamedevpl` opens a browser home with Open and Create.
`gamedevpl play [slug]` opens the matching game (the current checkout when omitted);
`gamedevpl create [idea]` opens a separate creation conversation. Opening home or
choosing Create without submitting an idea does not start an agent. Once a checkout
opens, Play starts automatically; required recovery and account questions appear in
that same browser session.

Use `gamedevpl --terminal`, explicit `repl`, or `connect` for terminal conversation.
`play --preview` retains raw preview. JSON, redirected/non-TTY and `play --stop` keep
the raw-preview path. Explicit `create --play` and `play --edit` also launch a
browser without a TTY; they cannot be combined with JSON, stop or raw-preview flags.
`--no-open` prints the complete session URL instead of opening it.
Browser launches stay in the invoking terminal by default. `Ctrl+C` ends Play and
cancels active local work. Use `gamedevpl --detach` or `gamedevpl play --detach` to
run in the background; `create --detach` also works without a TTY.

Raw preview uses the same full bleed game embedding as the workbench. Reload, sound
and game instructions live in the overlaid Preview controls; they reserve no stage
space. Build errors appear over the last playable build.

With `--detach`, the launcher exits; Play ends 60 seconds after the last browser or
paired phone tab closes, once active work finishes. Reopening a tab cancels the
countdown. **Commands → End session** and `gamedevpl stop` end it immediately.
Foreground sessions stay alive while their terminal is open, even with no tabs.
Repeated launches resume the matching session without replaying a supplied idea.
Reopening an already running session preserves its original terminal or background
ownership; the reopening command prints that fact and exits.
New-game intake never inherits the launch directory's existing checkout. An unknown
legacy mutation blocks a new create until reconciled; existing recovery journals and
acknowledged game identities remain authoritative. Explicit `play --edit` without a
slug retains the legacy directory journal for recovery. Interactive terminal `/play`
remains attached to that terminal's lifetime.
Raw local `play --preview` also waits in the terminal; `--detach` runs it in the
background. JSON output stays a one-shot discovery/launch command. Opening a remote
published game requires no local server and returns immediately.

## Finding and stopping sessions

`gamedevpl play --list` shows active workbenches and previews across directories.
Every row includes an ID, game, directory, URL and a stop command. Ordinary `play`
shows the same inventory before opening or reusing its requested session.
`--json` returns the list under `sessions` without opening a browser.

`gamedevpl play --stop` and `gamedevpl stop` target the current checkout; an explicit
slug selects that game. When the same game has sessions in different directories,
stop refuses the ambiguous selection and shows IDs. `--session <id>` stops exactly
one registered server from any directory, and `--all` explicitly stops them all.
The same selection flags work in `/stop` and `/play --stop`.

Legacy previews without directory metadata are listed by ID, and can also be matched
from their original checkout. Unreachable records are ignored. A stop is sent through
the verified loopback server's authenticated endpoint; stale PIDs are never killed.
Closing a remote game tab is outside this local session registry.

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

## Local code editor

**Code** opens the Studio editor beside the game and Conversation. Select an existing
text file from the current game's local checkout; Creator Kit TypeScript files appear
as read-only context. Other games, credentials, hidden files, raster assets and build
configuration are unavailable. The editor uses Studio's CodeMirror, search, undo history,
TypeScript extensions and ghost text rather than a separate editor implementation.

Edits stay as drafts until **Save** or **Ctrl/Cmd+S**. Switching files or closing panels
keeps drafts and undo history in the current tab. Closing Code never reconstructs the
game. Saving writes locally and the existing Play watcher rebuilds; Ask, Auto and Freeze
continue to govern when a playable replacement is shown. Save does not deliver, publish
or invoke a platform gate. Drafts and undo stacks are held in tab memory: reload or
closing the tab discards them; save or copy important drafts first.

Saves acquire the same checkout writer lock as agents and CLI mutations and compare a
version derived from the read file's contents and filesystem identity. A busy checkout,
stale project, deleted file or changed disk version refuses the write and keeps the draft.
The conflict panel shows disk contents; explicitly reviewing that version allows saving
the draft against its new version. Another disk change requires another review.
Ordinary editors do not share the CLI lock: version checks catch changes observed before
the atomic replacement, but the filesystem offers no transaction spanning an unrelated
writer's last-moment write. Do not concurrently save the same file from two editors.
Symbolic and hard links are refused. New files and renaming remain tasks for an external
editor or the agent. Text files are capped at 1 MB, the editor snapshot at 16 MB/2000 files.

TypeScript completion, advisory diagnostics, modifier-key hover and Ctrl/Cmd-click
navigation run in a local worker using the installed TypeScript libraries and Creator Kit
sources/declarations. No API key, Studio completion endpoint or CDN is needed. Kit
context is read-only; TypeScript library definitions are not editable project files.

AI completion is optional and off initially. Known CLI process environment variables
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) expose only
provider availability to the browser. Play does not read arbitrary home directories,
agent credential stores or env files. In Code → Optional AI completion, choose an available
provider, accept the disclosure and press **Enable AI completion**. Code fragments around
the cursor (up to 3000 characters before and 1200 after) go directly from the CLI to that
provider; costs belong to the user's provider account. Keys never enter browser responses.
Play never uses the Studio or platform-funded completion service. Models are currently
fixed to GPT-4.1 mini, Claude Haiku 4.5 and Gemini 2.5 Flash; account/model access is the
provider's responsibility. Suggestions use Studio's existing ghost text and Tab acceptance,
with a local limit of 12 requests/minute. Disable cancels active requests. Consent lasts
for this CLI session and is cleared when the selected checkout changes.

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
these are explicit measurement gaps. Local code-panel adoption, save/conflict outcomes
and completion quality also remain unmeasured; Studio completion telemetry stays wired
only in Studio, with no source text or file paths sent from Play.

Tests cover command retries, attachment validation, source checkpoint recovery,
unknown remote outcomes and phone authority. Phone protocol tests bind only loopback.
Real device/codec behavior needs a physical phone; desktop narrow viewports do not prove
it. Browser integration checks use synthetic game/API fixtures and incur no paid agent
or platform changes.

## Recovering from a build error

A failed first build replaces “Preparing your game…” with “Build failed”. If an update
fails, Play keeps the last working game and labels the failure “Update could not build”.
The error card provides expandable compiler diagnostics and **Copy error**. Diagnostics
render as text, including paths and line numbers reported by the compiler.

**Retry build** runs the local assembler again without requiring a file edit. It appears
only when the preview server supports retries. Saving source changes still rebuilds
automatically; a successful build clears the error card.

**Fix with agent** opens Chat and stages the compiler output as a diagnostic attachment.
It preserves an existing draft, or fills an empty draft with a repair request. Review the
request and press **Send** to use the normal builder selection and permission flow. The
button is unavailable while answering a question or choosing a builder; it does not answer
an approval or dispatch an agent automatically. If the game changes while evidence is
being attached, Play discards that staged attachment rather than submitting stale evidence.

## Recovering from failed local checks

When `/push`, `/submit` or `/verify` fails local verification, the interactive session
shows the failed check's diagnostic output and offers **Fix with agent**, **Check again**
and **Back — keep local changes**. The same choices appear in the terminal and Play's
Conversation. Fix with agent is offered when a local agent is available for that checkout.
Choosing Back or cancelling keeps local edits and sends nothing.

If game sources change during verification or while choosing a repair, the session
withholds agent repair until **Check again** supplies fresh diagnostics. Kept-local
notes and ignored media do not invalidate game verification.

Fix with agent passes the actual diagnostic report through the existing local builder
selection and permission flow. Diagnostics are identified as untrusted tool output;
the repair must preserve game behavior and must not weaken checks or modify shared tools.
The normal verification and repair loop checks the agent's changes afterward.

After a repair or successful recheck of a failed delivery, the session offers **Send preview**
or **Publish game**, according to the original delivery request. Confirming retries that
request with its original checkout and flags and reruns verification before sending.
Repairing a failure from `/verify` only repairs and checks the local game.

Non-interactive commands keep their failure exit code and print diagnostics plus the
specific Creator Kit command to run. They do not open a recovery menu.

The local editor browser regression runs without a deployed site or credentials:
`E2E_CHROMIUM_PATH=/path/to/chromium npm run e2e:play-code -w @gamedevpl/e2e`
(after the CLI UI build). It uses a temporary checkout, the real preview watcher and a
fixture assembler. It covers drafts/undo, local completion/hover/definitions/diagnostics,
writer locks, external conflicts, state-preserving updates, narrow layouts, the iframe
sandbox and absence of Studio/provider requests. Provider adapters use mocked fetches.
