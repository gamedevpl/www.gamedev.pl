---
name: cli-release
description: How gamedevpl (apps/cli) is versioned and released — the changelog is the source of truth, its categories decide semver, and merging the auto-opened release PR is the cutoff. Use whenever you change anything under apps/cli, need to cut or hold a CLI release, or the changelog guard fails in CI.
---

# Releasing the gamedevpl CLI

One file drives everything: [`apps/cli/CHANGELOG.md`](../../../apps/cli/CHANGELOG.md).
You write a line; the machinery derives the version, opens the release PR, and publishes
when a human (or auto-merge) merges it. There is no version to remember and no tag to push.

## When you change the CLI

Any PR that changes `apps/cli/src/**`, `apps/cli/scripts/**` or `apps/cli/adapters.json`
(tests excluded) must add a line under `## Unreleased`, or CI fails with the reason.
Pick the category by what a creator will notice:

| Category       | Means                                                       | Bump                          |
| -------------- | ----------------------------------------------------------- | ----------------------------- |
| `### Breaking` | A verb, flag, exit code or file layout changed incompatibly | minor before 1.0, major after |
| `### Added`    | Something new a creator can do                              | minor                         |
| `### Fixed`    | Something that was wrong now works                          | patch                         |
| `### Internal` | Refactor, perf, tooling — nothing a creator would notice    | **no release**                |

One line per change, present tense, ending with the PR number: `- \`gamedevpl checkout\` round-trips a working copy (#1173)`.
Write for the creator reading `gamedevpl update` output, not for the reviewer. Wrapped
continuation lines are fine (indent them).

The highest category present decides the bump. `1.0.0` is never derived — write that
header by hand when the CLI is ready to promise stability.

## How a release happens

1. Your PR merges to master with an `Unreleased` entry.
2. `cli-release-pr.yml` runs `release.mjs cut` on branch `release/cli`: moves
   `Unreleased` under `## X.Y.Z — date`, bumps `apps/cli/package.json` and the installer's
   default `CLI_VERSION`, and opens (or refreshes) PR **`release(cli): vX.Y.Z`**. Every
   later merge to master with more entries updates the same PR — that is batching.
3. **Merging the release PR is the cutoff commit.** It lands the version on master.
4. `cli-release.yml` sees `apps/cli/package.json` change, builds the bundle, attests
   provenance, and publishes `cli-vX.Y.Z` with the changelog section as notes.
5. `curl | bash` and `gamedevpl update` pick it up. The installer falls back to the
   latest release if its baked-in default is not published yet, so the site deploy and
   the release may land in either order.

To **hold** a release, leave the release PR open. To **skip** a release for a change,
file it under `### Internal`. To **cut by hand**: `npm run cli:release -- cut`, commit,
open a PR — the publish step is the same.

To make it **fully automatic**, set the repository variable `CLI_RELEASE_AUTOMERGE=true`:
the release PR arms `gh pr merge --auto` and merges itself once checks pass.

## Keep Creator Kit installations current

After publishing a CLI release, update `tools/pack-kit/cli-package-pin.json` in
`gamedevpl/www.gamedev.pl-games` to its published `gamedevpl-npm.tgz` URL and SHA-512
integrity. Hash the downloaded release bytes; never reuse the previous integrity.
When enabling npm GameKit installations, set `supportsNpmGameKit: true` in that
pin only after verifying the published CLI can play a project without root
`tools/` or `shared/`. The Kit publisher keeps the legacy layout until this flag
is present, preserving the release order: CLI first, then Kit activation.
For minified runtime packages, also set `supportsCompiledGameKit: true` only
after verifying that the published CLI loads the JavaScript assembler. Preserve
the source-based fallback for existing installations.
Also verify Local Play's Code index and file reads expose the installed Kit's
read-only declarations. A working preview alone misses lost TypeScript help;
retain the editor's path allowlist and rejection of symbolic links.
Run the games repo's scoped PR gate and pack the Kit with its real npm lockfile before
merging the pin update. That merge triggers Kit publication; verify the published
artifact when access is available and distinguish a merged pin from a confirmed publish.

Starting with 0.31.0, `gamedevpl update` updates the project's npm CLI dependency too.
Older running versions update only the standalone binary: run the installed CLI's
update once more from the game directory, or update the Creator Kit. A global version
change alone does not prove that `npm exec -- gamedevpl` uses the new version.

## Local commands

```bash
npm run cli:changelog             # the CI guard, against origin/master
npm run cli:release -- next       # the version the next cut would produce, or "none"
npm run cli:release -- notes 0.1.0
```

## Where the version lives

Two files carry it, and the cut writes both: `apps/cli/package.json` and `CLI_VERSION` in
`apps/api/src/platform/cli-installers.ts` (the installer's default). The newest released
section of the changelog must match them — `npm run lint` and `npm run test:rules` both
check it.

**The version the CLI prints is not a third copy.** `apps/cli/src/update.ts` derives it
from `package.json`, injected by esbuild at bundle time. It used to be a hand-kept
constant, and because nothing bumped it, _every_ release printed `0.1.0` — a creator on
0.3.0 saw 0.1.0 in the banner, the footer and `help`. Do not reintroduce a literal there;
the guard and a test both refuse one.

Drift is still possible one way: releasing by hand with `workflow_dispatch` and an
explicit version, which is how 0.2.0 and 0.3.0 shipped without touching the repo, leaving
`install.sh` serving 0.1.0. If you ever dispatch by hand, land the same version in the
repo in the same session.

## Traps recorded so far

- **A valid PNG does not prove that a game rendered.** The former local capture
  waited 1.5 seconds after navigation. A 6.6 MB GameKit 3D document returned an
  all-white PNG with no console errors because its frame had not loaded yet;
  a small synchronous canvas fixture passed. Wait for document and renderer
  readiness plus paint frames, and assert decoded screenshot pixels in the native
  regression. Exercise a real GameKit game too.

- **A Claude Bash permission prompt does not prove a sandbox escape.** With
  sandbox auto-allow enabled, variable-prefixed commands and content-scoped ask
  rules can still prompt. Test ordinary Bash through the real local MCP endpoint,
  alongside explicit sandbox overrides and symlinked file writes. A resume fixture
  that only approves Read and rejects an override misses a broken Bash path.

- **Auto-merge can close the release PR while verification is running.** Check the
  PR's current state before pushing another release-branch commit. A commit pushed
  after the cutoff needs a separate PR; it is not part of the published tag.

- **Rebase or a conflict-free merge can put entries below an already-published header.** Before a
  cut, compare the release tag with the feature merge. If `next` says `none` but the
  published artifact predates the feature, move that feature's entries back to
  Unreleased, preserving the released section from its tag, then cut a new version.
  Never republish the existing tag. Observed with #1223 after cli-v0.8.0.
  Before merging a CLI feature, inspect the changelog in the final merge tree,
  not only its branch: #1735 merged cleanly after 0.31.0 shipped, but its four
  entries landed under 0.30.0 and the release proposer reported nothing to release.

- **Check the workspace version in `package-lock.json`.** The release cut currently
  updates the two version sources but leaves the CLI workspace lock entry stale.
  Run `npm install` and include that version-only lockfile change in the release PR.

- **Build the contract before bundling.** CLI telemetry imports runtime values from
  `@gamedevpl/contract`. `compile-release.sh` builds that workspace so a fresh checkout
  works; locally cached `packages/contract/dist` can otherwise hide a broken release.

- **Check bundle size immediately after adding a runtime dependency.** Run
  `npm test -w @gamedevpl/cli -- src/bundle.test.ts` before the full gate. It runs
  the built CLI and enforces the 4.5 MB bundle budget. Release bundling removes
  whitespace while retaining identifiers and legal notices; keep the size guard
  rather than raising it to accommodate an unoptimized dependency.
  In Zod 4, import `import * as z from 'zod'` rather than `import { z } from 'zod'`
  in `apps/cli/src/`: the named `{ z }` re-export is a namespace object that blocks
  esbuild from tree-shaking unused locales and JSON Schema compilers (~486 KB).
  Run CLI prebuild, type-check, test and bundle commands sequentially: their
  shared UI generator writes and deletes the same `play-shell.mjs` file.

- **Local Play browser tests need the generated UI and TypeScript worker.** After
  `npm ci` and `npm run build:packages`, run `npm run prebuild -w @gamedevpl/cli`
  before `npm run e2e:play-code -w @gamedevpl/e2e`. Keep these fixtures in their own
  suite: the deployment browser gate does not build CLI assets. CI runs the local
  suite in the hermetic browser job, without credentials or live provider calls.
  For a system browser outside `/opt/pw-browsers`, set `E2E_CHROMIUM_PATH` to its
  executable. A skipped browser suite is no verification signal.
  Run the jsdom workbench fixtures too: shared components mount even while Code
  is closed, and viewport APIs such as `matchMedia` may be absent there.

- **Lazy editor assets are release artifacts.** Publish `play-typescript-worker.js.gz`
  beside the CLI and include it in `SHA256SUMS` and provenance. The CLI embeds its
  digest, verifies download/cache bytes, and caches by content hash. Keep developer
  copies in `dist/generated`; leave the worker out of the npm install archive so
  users who never open Code do not download TypeScript. Test first download and
  cached offline use with mocks, plus bundle/worker size budgets. First editor use
  needs GitHub access when its worker is not cached; document this limitation.

- **Wait for transient preview notices before recording layout geometry.** Local Play
  briefly shows “Build loaded”; the next preview poll clears it, and `ResizeObserver`
  releases the reserved bottom space. A fast CI browser can capture the smaller panel
  before this happens and compare it with the settled panel after restoring a view.
  Wait for the notice and its reserved space to clear, then assert the exact geometry.
  Poll restored geometry when an observer participates; do not add arbitrary sleeps.
  Likewise, poll the final React view after a native host event closes the chat:
  the host's `hidden` flag changes before React commits its corresponding layout.

- **Control polling clocks in jsdom unit tests.** A real 1.1-second sleep plus
  fixture parsing and another poll can exceed Vitest's default five seconds under
  load. Advance fake timers through the relevant polls, keeping the behavior
  assertions; do not give the entire CLI a larger timeout for that fixture.

- **`--generate-notes` is never used.** On a first release it wrote the whole repository
  history and hit GitHub's 125 000-character body limit (release run 3, 2026-09-04).
  Notes come from the changelog section.
- **No third-party actions in the release workflows.** `softprops/action-gh-release`
  made the workflow fail at startup with zero jobs — every other workflow here uses only
  GitHub-owned actions, and that convention now holds for releases too. `gh` does the job.
- **A PR pushed with `GITHUB_TOKEN` does not trigger CI.** If branch protection requires
  checks on the release PR, set secret `CLI_RELEASE_TOKEN` (PAT: contents + pull-requests
  write); the workflow prefers it when present.
- **The tag is created at publish time**, at the merged cut commit. Do not pre-push
  `cli-v*` tags — a stale tag pointing at an older commit is how `cli-v0.1.0` came to
  label an artifact built from a newer master.

## Code map

| Piece                                | Path                                                 |
| ------------------------------------ | ---------------------------------------------------- |
| Changelog                            | `apps/cli/CHANGELOG.md`                              |
| Parse / bump / cut / notes           | `eslint-rules/cli-changelog-lib.mjs` (+ `.test.mjs`) |
| PR guard (in `npm run lint` and CI)  | `eslint-rules/cli-changelog-check.mjs`               |
| `next` / `cut` / `notes` commands    | `apps/cli/scripts/release.mjs`                       |
| Release PR proposer                  | `.github/workflows/cli-release-pr.yml`               |
| Publisher                            | `.github/workflows/cli-release.yml`                  |
| Installer default version + fallback | `apps/api/src/platform/cli-installers.ts`            |

A named `{ z }` import from `zod` can retain the whole namespace in the CLI
bundle. Match the existing `import * as z` style and check the bundled size;
compare a clean base before loosening the bundle budget. The heuristic-client
change initially added about 450 KB through this import alone.
