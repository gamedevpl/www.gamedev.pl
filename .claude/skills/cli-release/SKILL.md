---
name: cli-release
description: How gamedevpl (apps/cli) is versioned and released — the changelog is the source of truth, its categories decide semver, and landing on master automatically cuts and publishes the release. Use whenever you change anything under apps/cli, need to cut or hold a CLI release, or the changelog guard fails in CI.
---

# Releasing the gamedevpl CLI

One file drives everything: [`apps/cli/CHANGELOG.md`](../../../apps/cli/CHANGELOG.md).
You write a line; the machinery derives the version and publishes when your PR lands on master.
There is no version to remember, no release PR to merge, and no tag to push.

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
2. `cli-release.yml` runs automatically on master:
   - checks `release.mjs next` to derive the version from `Breaking`/`Added`/`Fixed`,
   - executes `release.mjs cut` (moves `Unreleased` under `## X.Y.Z — date`, bumps `apps/cli/package.json` and installer `CLI_VERSION`),
   - commits back to master with `[skip ci]` and pushes the `cli-vX.Y.Z` tag,
   - bundles the CLI script, attests build provenance, and publishes the release on GitHub Releases.
3. `curl | bash` and `gamedevpl update` pick it up immediately. The installer falls back to the
   latest release if its baked-in default is not published yet, so the site deploy and
   the release may land in either order.

To **skip** a release for a change, file it under `### Internal`. To **cut by hand**: push a
`cli-v*` tag or trigger `workflow_dispatch` on `cli-release.yml`.

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

- **`--generate-notes` is never used.** On a first release it wrote the whole repository
  history and hit GitHub's 125 000-character body limit (release run 3, 2026-09-04).
  Notes come from the changelog section.
- **No third-party actions in the release workflows.** `softprops/action-gh-release`
  made the workflow fail at startup with zero jobs — every other workflow here uses only
  GitHub-owned actions, and that convention now holds for releases too. `gh` does the job.
- **The tag is created at publish time**, at the cut commit. Do not pre-push
  `cli-v*` tags — a stale tag pointing at an older commit is how `cli-v0.1.0` came to
  label an artifact built from a newer master.

## Code map

| Piece                                | Path                                                 |
| ------------------------------------ | ---------------------------------------------------- |
| Changelog                            | `apps/cli/CHANGELOG.md`                              |
| Parse / bump / cut / notes           | `eslint-rules/cli-changelog-lib.mjs` (+ `.test.mjs`) |
| PR guard (in `npm run lint` and CI)  | `eslint-rules/cli-changelog-check.mjs`               |
| `next` / `cut` / `notes` commands    | `apps/cli/scripts/release.mjs`                       |
| Automated release workflow           | `.github/workflows/cli-release.yml`                  |
| Installer default version + fallback | `apps/api/src/platform/cli-installers.ts`            |
