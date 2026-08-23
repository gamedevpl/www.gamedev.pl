# Content safety: layered safeguards for prompts and generated games

> Status: 🚧 **Layers 1, 1b, 4 and 5 are live and observed; slice 2 is done** (2026-07-30).
> Rejections are now counted and alertable — until then every layer here had been built and
> then never watched, so a deny-list that had stopped being called would have looked
> identical to one finding nothing. See Rollout at the foot of this file.
> Submitted specs are moderated before an agent ever sees them:
> [`createDefaultContentChecker`](../apps/api/src/platform/moderation.ts) returns the Vertex-backed
> checker whenever `NODE_ENV=production`, so moderation is on in prod by construction rather
> than by a flag someone must remember to set. Outside production it falls back to a pattern
> checker. A retired Vertex model therefore fails closed and takes creation down with it —
> the model id is env-tunable for exactly that reason.
>
> Owner requirement: no content that could be considered inappropriate — safeguards at every
> stage, with basic filtering + feedback on the website prompt. **Sequencing rule:
> `PRIVATE_BETA` must not flip to `false` until Layer 1 and Layer 4 are live.** The beta
> allowlist is still the interim safeguard: today only trusted, identified accounts can
> submit at all.

## Principles

- **Defense in depth, human gate last.** No single filter is trusted; the existing
  human merge (curation gate) remains the final decision on what gets published.
- **Creator text is data, never instructions** (existing invariant) — moderation
  reads it, nothing executes it.
- **Fail closed on spend.** When a check errors, the submission is rejected (429/422),
  not waved through — a false rejection costs a retry; a false accept costs Copilot
  budget and reviewer attention.
- **Feedback, not silence.** Rejections return a structured, i18n (en/pl) reason
  category so the creator can rephrase — but never echo which exact term tripped
  (that's a bypass oracle).
- **Attribution over prohibition.** Every submission is uid-attributed (M1) and
  quota-limited; repeat abusers get `tier: blocked` — the strongest deterrent we
  already have.

## The pipeline and its checkpoints

```
prompt (web) → POST /api/submissions → GitHub issue → Copilot agent → PR
   [L1]              [L1]                                [L2]        [L3]
→ human merge → published game served → played in sandbox
     [L4]              [L5]                  [existing]
```

## Layer 1 — Input screening at the API (first slice, build now)

New `apps/api/src/platform/moderation.ts`, applied to title + spec in `POST /api/submissions`
and to the prompt in `POST /api/generate-game`, BEFORE quota is consumed:

- **Deny patterns**: curated regex lists (en + pl — Polish profanity/slur coverage is
  a must, the audience is Polish) for: slurs/hate, sexual content, sexualized minors
  (hard block + log), graphic violence/gore requests, self-harm, doxxing/PII patterns
  (emails, phone numbers, addresses in prompts), and injection-style content aimed at
  the build agent ("ignore your instructions", "modify the workflow", "exfiltrate").
- **Heuristics**: repeated-character/leet normalization before matching
  (`n1gg3r`-style evasion), URL count cap (specs shouldn't link out), length floor
  (existing) and cap (existing).
- **Response**: `422 { error: 'content_rejected', category: 'profanity' | 'adult' |
'violence' | 'pii' | 'injection' | 'other' }`; web shows an i18n message per
  category with a "rephrase and try again" hint. Rejections are logged with uid +
  category (not the full text at WARN level — full text stays in DEBUG request logs).
- Keep the list in a data file (`moderation-terms.ts` or JSON) so updating terms is
  not a logic change. Unit tests: category matrix + evasion cases + clean-prompt
  passes (soccer games must not trip on "shoot"!).
- **Honest scope**: word filters are weak against determined adults. That's
  accepted — L1's job is fast feedback for good-faith users and blocking the
  egregious; L2/L4 catch the rest.

## Layer 2 — Agent-side refusal (games repo)

- Strengthen the games repo agent instructions (AGENTS.md / issue template):
  the agent must refuse specs requesting inappropriate content by closing the PR
  path — comment a standard refusal and label the issue `content-rejected`
  (maps to existing `needs_changes` status in the app).
- The agent already operates under GitHub/Copilot content policies; this makes the
  refusal path explicit and machine-readable.

## Layer 3 — Automated PR/content scan (games repo CI)

- Extend `tools/validate.mjs` (static gate that already checks secrets/external
  refs/size): scan SPEC.md frontmatter+body, game.js strings, index.html text
  content against the same term lists (shared or vendored copy). A hit fails
  validation → PR can't merge green.
- Also scan rendered _strings_ in game.js (the game's visible text), not just the
  spec — generated games can contain text the spec never asked for.

## Layer 4 — Human merge (exists — keep it, name it)

- Publishing = a human merging the PR. Document in the games repo README that
  content review is part of merge review. This is the safety boundary of record;
  everything above just reduces its load.

## Layer 5 — Post-publication

- **Report mechanism ✅ live**, though not in the shape this bullet proposed — see the
  Rollout note on slice 2 for why an issue was the wrong medium. It is a DSA art. 16
  `mailto:` on the play page ([`ReportGameButton.tsx`](../apps/web/src/ReportGameButton.tsx)),
  pre-filled with what a notice must contain to oblige us to act. Handling a report is
  [`moderation-burst.md`](./runbooks/moderation-burst.md) Part 2; unpublishing is still a
  merge plus a green bake, and **verifying the bake is the step that actually removes the
  game** — published play is served from the snapshot, so a merge alone leaves it playable.
- **Kill switch that already exists**: removing the game dir from `main` (or
  flipping SPEC status) drops it from the catalog server-side within 60s.

## Layer 1b — LLM moderation via Vertex AI (owner decided 2026-07-23)

Decision: **Vertex AI on the gamedevpl project**, not a direct Anthropic/OpenAI
integration. Rationale: ambient IAM auth via the Cloud Run runtime SA — **no API
key exists anywhere** (same pattern as Firestore); single GCP bill; Gemini
Flash-Lite is sufficient for classification and handles Polish natively; Claude
models remain available through Vertex Model Garden by changing a model string if
classifier quality ever needs it.

- Provisioning (idempotent, add to `infra/setup-gcp.sh`): enable
  `aiplatform.googleapis.com`; grant `roles/aiplatform.user` to the runtime SA.
- Region: **resolved** — the client defaults to the **global endpoint**
  (`location: 'global'`), where the Gemini 3 family is served. Still env-tunable via
  `VERTEX_REGION` if a specific region is ever needed.
- `moderation.ts` seam: `interface ContentChecker { check(text): Promise<Verdict> }`
  with two implementations — `PatternChecker` (L1 regex, always on, also the
  fallback) and `VertexChecker` (prompted Gemini classifier). Verdict =
  `{ allowed: boolean; category?: RejectCategory }`.
- Classifier prompt: user text embedded strictly as quoted data to classify
  (never as instructions); fixed JSON output schema; malformed output or API
  error/timeout (~5s, one retry) → **fail closed** (`other` category, WARN log).
  Runs BEFORE issue creation and BEFORE quota consumption, after the regex
  pre-filter.
- Tests: stub the Vertex client (same seam discipline as `githubClient` /
  `Store`); no live Vertex calls in CI.

## Explicitly NOT in the first slice

- Image moderation (games are canvas-drawn; revisit if generated images appear).
- Appeals/queue UX — beta scale doesn't need it; rejection + rephrase is enough.

### Audio moderation — revisited 2026-08-12, still not needed

The deferral above said "revisit if generated assets appear." They have: vendor-generated
sound effects are becoming a second audio asset class alongside the synthesized catalog.
Revisited, and the answer is that **no automated audio moderation is warranted for this
scope** — not because the risk is small, but because the pipeline has no opening for it:

- **No creator input reaches the vendor.** Generation is owner-run from a machine holding
  the API key, which is deliberately never a repository or Actions secret. There is no path
  by which a creator prompt becomes a generation request, so the untrusted-text problem that
  L1/L1b exist to solve does not arise here.
- **Every clip is auditioned before it is committed.** The catalog is curated: generate
  candidates, listen, keep one, commit it with a provenance record. Human review at commit
  time is the control, and it is a stronger one than a classifier — a person hears what a
  clip actually sounds like.
- **Committed audio is fixed and hash-verified.** Assets are byte-pinned in the repo and
  checked by SHA-256 in the gate. What shipped is what was reviewed; there is no
  regeneration at build or run time that could drift away from the reviewed bytes.

This closes the deferral for **curated, owner-generated effects only**. Two changes would
reopen it, and neither is in scope today:

1. **Creator-driven generation** — a creator prompt reaching a metered vendor puts untrusted
   text in front of a generator, which needs the same treatment as L1/L1b give game prompts.
2. **Speech** — narration or character voice carries impersonation and read-aloud-slur risk
   that sound effects do not. Curated review still applies, but the risk profile is
   different enough to deserve its own decision rather than inheriting this one.

## Rollout

1. **Slice 1 (before any public flip)**: L1 module + tests + web i18n feedback; L3
   validate.mjs extension; L2 instruction hardening. All verifiable offline.
2. **Slice 1b (with slice 1 or immediately after)**: Vertex checker behind the seam
   (Layer 1b above) + `setup-gcp.sh` provisioning.
3. **Slice 2 ✅ done (2026-07-30)**, and it turned out both halves were nearly there:
   - **Report button (L5) — already shipped**, and not as this plan imagined it. It is a
     DSA art. 16 `mailto:` pre-filled with the four things a notice must contain
     ([`ReportGameButton.tsx`](../apps/web/src/ReportGameButton.tsx)), rather than the
     games-repo issue sketched in Layer 5 above. Filing an issue was the wrong medium
     twice over: publication authority is moving into a registry we own (so a takedown
     becomes a flag flip, not a revert), and a legal notice needs a reply to the reporter,
     which an issue does not give. **The remaining gap is deliberate**: art. 16 wants a
     confirmation of receipt and art. 17 a statement of reasons, neither of which a mailto
     can send. The in-product form that fixes both is Phase 2 of the legal-compliance plan
     in the private ops repo, sequenced _after_ counsel's review, because that copy is
     legally operative text rather than UI wording. Building it first would mean writing it
     twice.
   - **Moderation metrics — built.** Every rejection now emits one structured line from
     [`moderation-metrics.ts`](../apps/api/src/telemetry/moderation-metrics.ts), carrying surface,
     category and uid, and never the rejected text. A log-based metric backs alert **A14**
     ([`moderation-burst.md`](./runbooks/moderation-burst.md)).

   Two decisions inside the metrics worth not relitigating. **The text is not logged**: it is
   the abusive content itself, and writing it into Cloud Logging would give user-authored
   abuse material a second home with its own retention and no erasure path, in service of a
   feature whose purpose is keeping it out. The category is what makes a rejection
   actionable; the wording never was. **The uid is logged**, because concentration is the
   signal — one rejection is someone phrasing badly, twelve from one uid in a minute is
   somebody finding the wall, and a bare count cannot tell those apart.

   The alert's interesting case is the inverse of its name. A burst from few uids means the
   deny-list is _working_ and can wait; **many uids in one category means it is rejecting
   legitimate creators**, which is a user-facing outage that presents as "the site is
   broken" and never as an error. A14's threshold is set well above organic traffic for the
   same reason: an alert on the feature succeeding is one the operator learns to delete.
