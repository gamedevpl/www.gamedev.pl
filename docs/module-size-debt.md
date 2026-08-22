# Module size debt (website)

Phase 0 of [`north-star-architecture.md`](https://github.com/gamedevpl/www.gamedev.pl-ops/blob/main/docs/north-star-architecture.md)
(private ops repo). Several `apps/api` and `apps/web` modules grew past 5,000 lines by
never having a ceiling — `store.ts` at 8,748 lines is the extreme, but it is not alone.
This is the ratchet that stops that from ever happening silently again.

## The seal

**Rule for `apps/**/*.ts(x)` and `packages/**/*.ts(x)`** (fixtures excluded):

| Allowed                                                      | Forbidden                                  |
| ------------------------------------------------------------ | ------------------------------------------ |
| A file at or under its own recorded ceiling                  | A file that grew past its recorded ceiling |
| A new file (none existed at freeze time) under **500** lines | A new file over 500 lines                  |
| Shrinking a file, any amount                                 | Raising a ceiling without `--force`        |

Enforce: `eslint-rules/module-size-check.mjs` via `npm run module-size` (also part of
`npm run lint`).

Per-file ceilings are frozen in
[`eslint-rules/module-size-baseline.json`](../eslint-rules/module-size-baseline.json),
seeded from the file's line count at freeze time (2026-08-19). A file may **shrink** its
ceiling; it may **not** grow it. A file with no baseline entry — created after the freeze
— gets the flat 500-line hard cap instead of its own history.

```bash
npm run module-size                                            # report
npm run module-size -- apps/api/src/store.ts                   # one file
npm run module-size -- apps/api/src/foo.ts --write --force     # raise ONE ceiling
npm run module-size -- --write --reseal                        # reseal every file
```

## Raising a ceiling is allowed

A file that genuinely needs to grow may raise its own ceiling: run `--write --force`
**scoped to that path**, and the diff shows one number moving, for review like any other
change. Extract when the file is doing too much; raise when the growth is the work.
Tests are the ordinary case — they grow with the features they cover.

**Never run `--write` unscoped.** It does not only raise the file you are fixing; it also
*lowers* every other ceiling to whatever that file happens to measure today, freezing
files nobody touched. That is how a test file created an hour earlier ended up pinned at
60 lines, and it is why the checker now refuses an unscoped `--write` without `--reseal`.

Reach for `--reseal` only when you mean "re-baseline the whole repo", which is rare.

The point of the ratchet is that `store.ts` never quietly becomes 8,791 lines again — not
that no file may ever gain a line. If you find yourself deleting blank lines or shortening
comments to fit, that is the wrong trade: raise the ceiling instead.

## Why a hard cap instead of baseline-everything

Comment-prose debt ([`comment-prose-debt.md`](./comment-prose-debt.md)) baselines new
files at **0** — no prose debt is ever acceptable in new code. Line count is different:
some amount of a new module is normal, and forcing every new file through an explicit
baseline entry would just teach agents to run `--write` reflexively instead of splitting
early. A flat 500-line ceiling gives a new module room to be a real module, and still
catches it well before it becomes the next `store.ts`.

## The freeze

Until these files are properly decomposed, **no new routes or logic land in `store.ts`,
`submissions.ts`, `mcp-server.ts`, or `agent-channel.ts`.** Additions to those surfaces go
in a new, cohesively-named module and are wired in from the existing composition points —
this ratchet is what makes that an enforced rule rather than a request.

## Cost-effective cleanup

1. **Opportunistic** — a PR that already touches a heavy file extracts a cohesive piece
   while it's there, then `npm run module-size -- --write`.
2. **Hot-path first** — `store.ts`, `submissions.ts`, `mcp-server.ts`, `agent-channel.ts`
   are also the files agents re-read most; shrinking them cuts token spend as well as
   ceiling debt.
3. **Mechanical batches** — one extraction (a cohesive slice, a shared primitive) per PR.
4. **Ratchet, never reopen** — do not raise ceilings to turn CI green; split the file
   instead.

Track with `npm run module-size` (largest list).
