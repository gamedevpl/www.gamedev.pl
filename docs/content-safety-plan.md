# Content safety: layered safeguards for prompts and generated games

> Status: 🚧 **Layer 1 is live; the later layers are still design** (verified 2026-07-26).
> Submitted specs are moderated before an agent ever sees them:
> [`createDefaultContentChecker`](../apps/api/src/moderation.ts) returns the Vertex-backed
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

New `apps/api/src/moderation.ts`, applied to title + spec in `POST /api/submissions`
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

- **Report mechanism** (later, when public): a "report this game" button on the
  play page → creates an issue in the games repo with slug + reporter uid; owner
  unpublishes by reverting the merge (catalog updates within its 60s TTL).
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

- Image/audio moderation (games are canvas-drawn; revisit if generated assets appear).
- Appeals/queue UX — beta scale doesn't need it; rejection + rephrase is enough.

## Rollout

1. **Slice 1 (before any public flip)**: L1 module + tests + web i18n feedback; L3
   validate.mjs extension; L2 instruction hardening. All verifiable offline.
2. **Slice 1b (with slice 1 or immediately after)**: Vertex checker behind the seam
   (Layer 1b above) + `setup-gcp.sh` provisioning.
3. **Slice 2 (with public launch)**: report button (L5), moderation metrics in logs
   (count by category/uid) so the owner sees attempted abuse.
