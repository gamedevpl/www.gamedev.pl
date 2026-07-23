# Creator Q&A: clarifying-questions flow before generation

> Status: plan (2026-07-23, owner approved shape + sequencing). Builds AFTER
> content-safety slice 1/1b — it reuses the Vertex AI plumbing slice 1b creates.
> The regex safety layer (slice 1) remains the only hard prerequisite for going
> public; this feature is UX polish on top, not a launch gate.

## Why

The expensive step in the pipeline is the Copilot agent run: quota-limited
(5/day), slow (minutes), and effectively one-shot. A vague prompt burns a run
on a guess. A cheap, fast Q&A pass before the spec is frozen raises the hit
rate of the expensive run — creators get a good game sooner and stop wasting
their own quota on "that's not what I meant" retries.

Interaction model deliberately mirrors Claude Code's AskUserQuestion: a few
targeted questions, each with clickable proposed answers, free-text always
possible, and skippable at every moment.

## Principles

- **Ramp, not gate.** A "Create now" button is visible at all times; answering
  zero questions must produce exactly today's behavior. No answer is required.
- **Questions only about what's missing.** The model is asked to identify
  underspecified dimensions of THIS prompt — never a fixed questionnaire. A
  detailed prompt should yield fewer (or zero) questions.
- **User text is data, never instructions** (existing invariant) — the prompt
  is embedded as quoted data in the question-generation call, same discipline
  as the moderation classifier.
- **Cheap and fail-open.** Question generation failing (timeout, malformed
  output) silently degrades to the plain submit flow — the OPPOSITE of
  moderation's fail-closed rule, because this layer spends nothing and guards
  nothing. Moderation has already passed before this step runs.
- **Answers are creator content.** Merged answers go through the same L1
  moderation as the prompt (a clicked chip is safe by construction; free-text
  "Other" answers are not).

## Flow

```
prompt → L1 moderation (422 on reject)
      → POST /api/submissions/refine  → questions + proposed answers (chips)
      → creator clicks through / types / or hits "Create now" at any point
      → answers merged into spec as "## Creator clarifications"
      → POST /api/submissions (existing path, unchanged contract)
```

## API

`POST /api/submissions/refine` — session + quota-free (does NOT consume the
daily submission quota; it has its own cheaper rate limit, e.g. 20/day/uid,
env-tunable `DAILY_REFINE_QUOTA`), body `{ title, spec }`:

- Runs L1 moderation first (same 422 contract as submit — reject early, spend
  nothing).
- Calls Vertex AI (Gemini Flash-Lite, same `VertexChecker`-style client and
  region config as Layer 1b) with a fixed-output-schema prompt: identify up to
  4 underspecified dimensions, return
  `{ questions: [{ id, question, options: [{ label, detail? }], allowFreeText: true }] }`.
- Response passes through zod validation; anything malformed → `200 { questions: [] }`
  (fail-open, client just shows the normal submit button).
- Typical dimensions the prompt template suggests (not mandates): genre
  mechanics, visual style, controls, difficulty/pacing, win/lose condition,
  theme details. Language: questions come back in the creator's UI language
  (en/pl — pass the locale).

## Web UX

- After the creator types a prompt and hits "Continue", show the questions as
  cards with clickable answer chips (+ an "Other…" free-text input per
  question), Claude Code style.
- A persistent primary **"Create now"** button above/below the cards submits
  immediately with whatever has been answered so far (including nothing).
- Answered chips render into a read-only "Creator clarifications" preview
  appended to the spec, so the creator sees exactly what will be submitted.
- Visual style question v1: static curated options rendered as small style
  swatches (pixel-art / neon-arcade / minimal-flat / cartoon) — designed once
  in the web app, no image generation. The chosen style is just text appended
  to the spec.
- Skippable per-question; zero-answer path identical to today's flow.

## Spec merge format

Appended to the submitted spec body:

```markdown
## Creator clarifications

- Visual style: neon-arcade
- Controls: arrow keys + space to jump
- Difficulty: starts easy, speeds up every 30s
```

Plain bullet list — the games-repo agent already consumes free-form specs;
no games-repo changes needed for v1.

## Moderation interaction

- Refine endpoint: L1 (and later 1b) runs on the incoming prompt BEFORE any
  Vertex question-generation call.
- Submit endpoint: unchanged — the merged spec (prompt + clarifications) goes
  through the full moderation stack again. Free-text answers get no special
  bypass.

## Tests

- Stubbed Vertex client (same seam as Layer 1b): question generation returns
  fixture questions; malformed fixture → empty questions (fail-open assert).
- Moderation-rejected prompt → 422 from refine, Vertex client NOT called.
- Refine quota: 21st call/day → 429; refine calls do NOT touch the submission
  counter.
- Web: chips render, "Create now" always enabled, zero-answer submit payload
  identical to legacy flow.

## Sequencing

1. Content-safety slice 1 (regex) — hard prerequisite for public flip.
2. Slice 1b (Vertex moderation) — creates the Vertex client/plumbing.
3. **This plan** — second consumer of the same plumbing.
4. Later ideas (explicitly not v1): generated style-preview thumbnails,
   multi-turn refinement, question quality metrics.
