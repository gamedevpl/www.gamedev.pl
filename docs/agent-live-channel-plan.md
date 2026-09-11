# Agent live channel

> Status: ✅ **Live** (verified 2026-07-26). Agents report progress over
> `/api/agent/build/*` ([`apps/api/src/agent-surface/agent-channel.ts`](../apps/api/src/agent-surface/agent-channel.ts)) —
> one HTTP call, no commit, and the reply carries any change requests the creator has sent.
>
> Supersedes the transport in [agent-progress-notes.md](./agent-progress-notes.md). That contract
> — a `PROGRESS.md` journal committed to the branch — shipped on 2026-07-24 and was in production
> for one build before its limits showed. The journal survives as the fallback; this document
> replaces how updates _travel_.

## The complaint

From the owner, watching a real build:

1. `PROGRESS.md` is unstructured and monolingual — it needs machine-readable shape and i18n.
2. The agent writes the file but does not reliably **commit** it, so nobody ever sees it.
3. Updates are far too infrequent.

## Why the transport is the cause, not the agent

Every one of those follows from choosing git as the wire.

- **Latency is the agent's to decide.** A progress note is only visible after `git commit` **and**
  `git push`. Copilot batches pushes; work sits locally for tens of minutes. Complaint 2 is not
  the agent misbehaving — it is the agent behaving normally on a transport that requires an
  unnatural act (pushing something with no code in it) to deliver a sentence.
- **Each update is expensive.** A push runs `validate.yml` — typecheck, tests, trace goldens,
  build. An agent that internalises "commit small and often" is also burning CI on every progress
  note, so it learns to batch. The transport charges by the message, which guarantees complaint 3.
- **Our read path adds its own delay.** We fetch `games/<slug>/PROGRESS.md` through the GitHub
  contents API, cached ~60 s, only when a status poll happens. Best case, a note the agent wrote
  is on screen well over a minute later; realistically, much longer.
- **It is one-way.** The return path (creator → agent) is a PR comment plus the relay workflow.
  The agent notices between turns, if at all.
- **Free text is the wrong payload.** Markdown prose can only be rendered as prose. There is
  nothing to key i18n off, no step, no progress fraction, no way to draw anything but a sentence.

So the fix is not a better file format. It is a channel the agent can write to for free, and read
from in the same call.

## Shape

```
  agent session                  our API (Cloud Run)              creator's browser
  ─────────────                  ───────────────────              ─────────────────
  report_progress ──POST──▶  verify build token
                             append event → Firestore
                    ◀──200──  { pending: [creator messages],
                                control: { abandoned, locale } }   ◀── status poll (3 s)
```

One HTTP endpoint, authenticated per build, returning the creator's queued messages in the
response body. That single detail is what makes it bidirectional: an agent that reports gets
answers, and it costs it nothing extra to ask.

### 1. Addressing and auth: a per-build token in the issue body

No new secret has to reach the agent's environment. We already mint capability tokens as HMACs
over an id (`submission-token.ts`, `unsubscribe-token.ts`, `mp.ts` room tokens); this is the same
pattern with a fresh scope prefix:

```ts
mintAgentToken(jobId, secret); // scope: 'agent-channel-v1'
```

It goes into the issue body under a `## Build channel` heading, so the agent reads it from the
task it was handed. The games repo is **private**, so the token's audience is us and the agent.
Blast radius if it leaks: someone can post progress text to one build — text we already sanitize
and render escaped, on a page only that creator and their share-link recipients see.

Server-side, verification also checks the submission is live: an abandoned or published build
refuses writes (`410 gone`), which is how the agent finds out it should stop.

### 2. The event schema (fixes complaint 1)

```jsonc
{
  "kind": "step", // step | milestone | asking | blocked | done
  "step": "mechanics", // enum: planning|art|mechanics|audio|balancing|fixing|testing|polishing
  "text": "Adding grenades to the soldiers.",
  "textLocalized": "Dodaję granaty żołnierzom.", // optional, in the creator's locale
  "progress": { "done": 3, "total": 8 }, // optional
}
```

The **enum carries the meaning, the sentence carries the flavour**. This is the whole i18n answer:
`step` and `kind` map to our own translated copy in `en.json`/`pl.json` — real translations, no
machine translation, correct every time. Only the free sentence needs Vertex, and only when the
agent did not supply `textLocalized`.

And the agent _can_ supply it: we know the creator's locale at submission time, so we put it in
the issue body and ask for the sentence in that language. An LLM writing one sentence in Polish
beats our per-line MT cache on quality and costs us nothing. Vertex becomes the fallback — for a
shared draft link read in a third language, or an agent that skips the field.

`progress` gives the status page a bar that means something, instead of counting ticked checklist
boxes.

Requires one new field on `SubmissionRecord`: `locale`, captured at creation.

### 3. Delivery to the browser

Events land in Firestore under the submission and ride out on the existing status response
(`progress.events`). The status page already polls every 3 s during an active build — against the
current commit → push → CI → 60 s-cached-contents-API path, that is not a small improvement, it is
a different order of magnitude, and it needs no new infrastructure.

SSE (`GET /api/submissions/:token/stream`) is the obvious next step, but it should wait until 3 s
is demonstrably not enough. Note that in-memory fan-out is **not** an option: the service deploys
with `--max-instances 4`, so the event log has to be in Firestore regardless.

### 4. Bidirectional: the return channel (and its hard limit)

Every agent call returns `pending` — creator messages sent from the status page since the agent
last checked — plus control flags. `POST /api/agent/:token/ack` marks them consumed.

This delivers feedback in seconds instead of waiting on a PR comment plus the relay workflow. But
be precise about what it can and cannot do:

- It makes an **active** agent responsive.
- It cannot **wake** a stopped one. An agent whose session ended is not polling anything; only a
  GitHub event re-triggers it. So creator feedback must keep going out as a PR comment as well —
  the channel is the fast path, the comment is the wake-up and the permanent record.

The `control.abandoned` flag pays for itself on its own: today, stopping a build closes the issue
and PR, but an agent mid-session keeps working for a while on a game nobody will ever see.

### 5. Live builds before commit (complaint: "the wait has nothing to show")

`POST /api/agent/:token/build` with the assembled game (games are capped at 200 KB by the repo's
own budget — this fits comfortably). The status page plays it immediately.

What it buys: a playable preview **before the first push**, no CI churn per iteration, and a
preview that tracks what the agent is actually doing rather than what it last decided was worth
committing.

What it costs: the preview can show something that was never committed. Mitigate by expiring the
pushed build as soon as a new commit lands on the branch (we already track `headSha`), and
labelling it as an unsaved work-in-progress. Security is unchanged — same `assembleGameHtml`
with `restrictNetwork`, same `sandbox="allow-scripts allow-pointer-lock"` iframe with no `allow-same-origin`, same
`default-src 'none'` CSP. Nothing about this makes agent code more trusted than it is today.

### 6. Rich media (screenshots)

This is the cheapest win in the document, because the agent **already does the hard part**. The
merged `cannon-fodder-squad` ships `media/opening.png`, `media/engagement.png`,
`media/field-pressure.png` and `media/gameplay.mp4`, all produced by `tools/capture.ts` driving
headless Chrome. The agent renders real frames of the real game today; they simply arrive at the
end, in a merge commit, long after the creator stopped watching. The piece that is missing is
somewhere to send them _while it works_.

`POST /api/agent/:token/media` with a PNG, capped at ~200 KB, attached to an event and rendered as
a thumbnail in the feed. Store it as a Firestore document (base64 of 200 KB is ~267 KB, inside the
1 MB document limit) and serve it back through our API. That avoids adding a GCS bucket, a new
dependency and its IAM — revisit only if video or many-per-build turns up.

Moderation: a screenshot is strictly less exposure than the playable draft we already serve from
the branch on `#/draft/<slug>`, so it needs no new gate.

## Interface for the agent

Three candidates, and they are not exclusive:

|                                        | Reach                                                                               | Effort | Notes                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| **Repo CLI** (`npm run progress -- …`) | every agent (Copilot, Codex, Claude — see [agent-adapters.md](./agent-adapters.md)) | low    | Runs locally, testable, showable verbatim in the skill |
| **MCP server**                         | Copilot coding agent, and any MCP client                                            | medium | Model-native tools; agents _use_ tools and _skip_ docs |
| **Raw curl in the skill**              | everything                                                                          | none   | Fragile, unreadable in a skill, no validation          |

Recommended: **CLI first, MCP second, over the same endpoints.** The CLI works for every agent
today with no platform lock-in, and it is the thing a skill can demonstrate exactly. MCP is the
upgrade that changes agent _behaviour_ — a registered `report_progress` tool gets called far more
reliably than a documented convention does — and it is a thin adapter once the HTTP surface
exists.

## What you need to change on GitHub

The Copilot coding agent runs behind an egress firewall, so **the shipped channel stays dark until**:

1. **Settings → Copilot → coding agent → custom allowlist**: add `www.gamedev.pl`.

Nothing else is required — the build token rides in the issue body, so no secret has to be placed
in the agent's environment. Until the allowlist entry exists, the agent's calls fail and it falls
back to committing `PROGRESS.md`, exactly as the skill instructs. If egress turns out not to be
openable at all, the fallback design is a GitHub-native channel (a bot comment stream on the PR,
written through the API rather than through commits) — slower and noisier, but still off the git
critical path.

## Phasing

1. ✅ **P1 — the channel.** Shipped; see below.
2. **P2 — live build push + screenshots.** The two things that make the wait watchable.
3. **P3 — MCP server + SSE.** Behavioural reliability for the agent, sub-second for the browser.

P1 is the one that fixes all three complaints. P2 is the one creators will talk about.

## What P1 shipped

Endpoints (`agent-channel.ts`), all authenticated by `Authorization: Bearer <build token>` — the
token carries the issue number, so nothing is addressed in the URL:

| Route                             | Purpose                                              |
| --------------------------------- | ---------------------------------------------------- |
| `POST /api/agent/build/progress`  | Record an event; reply carries `pending` + `control` |
| `GET /api/agent/build/inbox`      | Read the creator's messages without posting          |
| `POST /api/agent/build/inbox/ack` | Mark messages handled                                |

Decisions worth remembering:

- **Reading is not acknowledging.** An agent that reads a change request and then crashes must not
  lose it, so delivery is at-least-once and `ack` is a separate call.
- **A rejected report still answers with the inbox.** Rate-limited or capped calls return 200 with
  `accepted: false` and a `rejected` reason rather than an error — dropping the creator's message
  because the agent was chatty would be the worst of both.
- **Events hang off the status response, not off `progress`.** Every `progress` field needs an open
  PR; the minutes before the first PR exists are exactly when the page had nothing to show. A
  `queued` build now streams updates.
- **Events bypass the 60s status cache** with a 5s cache of their own, invalidated on append. The
  GitHub-derived part of a status is worth a minute; an agent's live update is worth seconds.
- **Caps:** 240 events/hour and 500 events/build, 300 chars each, sanitized as untrusted text.
- **The channel carries our verdict back.** Every reply includes `gate` once something has been
  delivered — `{ version, green, ranAt, report }` read from the delivered version's manifest — and
  `control.mustFixGate` when it is red. The gate is the one step an agent cannot see: it runs after
  the upload, in our container, against our engine, so a session that delivered and exited learned
  nothing and the next round began from a report nobody had read. `npm run submit` in the games repo
  waits on this and exits non-zero on red, which is what makes the agent's own last command tell it
  the work is not finished. Read only after a delivery — before that there is no verdict to have,
  and this rides an inbox poll that runs at up to 600/hour per build.

The creator's language is captured at submission (`SubmissionRecord.locale`), written into the
issue, and returned in every `control` block, so the agent writes its sentence in that language and
no model is asked to translate it afterwards.

Verified end-to-end against a locally booted API driving the real games-repo CLI: report → the
creator's pending message came back in the same reply → ack → a second report with a `--done/--total`
fraction → the status endpoint served both events in Polish while the build was still `queued` →
abandon → the CLI was told to stop and exited 2.

## Open questions

- Does the agent environment actually have egress to `www.gamedev.pl` once allowlisted? Untested.
- Does headless Chrome exist in that environment, or does `capture` need
  `copilot-setup-steps.yml`? (The captured media on `cannon-fodder-squad` suggests it runs
  somewhere in the pipeline; worth confirming it is the agent's session and not a local run.)
- Do we keep committing `PROGRESS.md` as build history once the channel carries the live feed?
  (Leaning yes — it is the only durable record on the PR, and it costs nothing.)
