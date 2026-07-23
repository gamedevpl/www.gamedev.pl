# Roadmap

Status legend: ✅ done · 🚧 in progress · 📋 planned/not started · 🗃️ retired

## Phase 0 — Local player proof ✅

The local `prompt → mock template → sandboxed iframe` slice is complete:

- npm workspaces with React/Vite, Fastify, and strict TypeScript.
- `GameProject` plus a deterministic mock and three playable templates.
- A self-contained bundle assembler and sandboxed iframe player.
- Request validation, bundle size limits, credential-pattern scanning, localization, tests,
  linting, and CI.

This loop remains a development preview. It is not the production creation model.

## Retired direction — self-hosted generation 🗃️

The container runner, auth proxy, job tokens, in-process orchestrator, `/api/jobs` endpoints,
and container generator were removed. The app will not run coding agents on behalf of creators.
Historical design and security notes remain in the repository for context, but this work is not
scheduled and must not be treated as an incomplete phase.

## Phase 1 — Dedicated games repository 📋

**Goal:** establish the source of truth and publishing contract for agent-maintained games.

- Create the dedicated repository from [`games-repo-blueprint.md`](./games-repo-blueprint.md).
- Add its agent instructions and issue templates.
- Seed it from the three working templates in `packages/game-generator/templates`.
- Implement static validation, bundle assembly, and catalog generation.
- Add PR validation and main-branch publishing workflows.
- Choose GitHub Pages or a separate bucket/CDN as the initial cookieless games origin.
- Require human review as the initial moderation and merge gate.

## Phase 2 — Catalog and player 📋

**Goal:** turn this app from a mock generator demo into a useful game catalog.

- Define and version the `catalog.json` contract.
- Browse, filter, and select published games.
- Load published bundles in the sandboxed iframe.
- Add loading, unavailable-game, and validation-failure states.
- Automate a regression test for the iframe sandbox invariant.
- Decide whether to retain the prompt-based mock preview as a development-only route.

## Phase 3 — Spec submission and status 📋

**Goal:** let a creator commission a game without implying instant generation.

- Design structured-frontmatter plus free-form spec input.
- Add authentication or another reliable attribution mechanism.
- Add consent/rights language, moderation, rate limits, and spam controls.
- File a structured issue in the games repository with narrowly scoped credentials.
- Surface lifecycle states such as submitted, under review, agent working, PR open, and
  published.
- Avoid exposing repository tokens to the browser or to submitted spec content.

## Phase 4 — Remix through spec changes 📋

**Goal:** let a player propose a change while preserving review and ownership.

- Capture a change request against the selected game's `SPEC.md`.
- File a scoped issue or proposed spec change in the shared games repository.
- Let a coding agent propose the matching spec and implementation diff through a PR.
- Preview the candidate bundle in the same sandbox before merge.
- Never auto-merge agent output.

See [`remix-to-pr.md`](./remix-to-pr.md).

## Phase 5 — Production delivery 📋

**Goal:** deploy only the catalog, player, submission API, and static games pipeline actually
required by the pivot.

- Choose the hosting platform after the games publishing contract exists.
- Keep the app origin and games origin separate.
- Use OIDC-based deployment credentials, protected environments, and pinned actions.
- Add observability, takedown operations, backups, and rollback for published catalogs.
- Introduce infrastructure as code only after these resources are decided.

## Next decision

Phase 1 is the current product bottleneck. Catalog, submission, and deployment should not be
built against an invented contract before the games repository and its published artifacts
exist.
