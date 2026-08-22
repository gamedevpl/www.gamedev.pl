# Comment prose debt (website)

Same seal as games-repo Check 34. Models have been writing multi-paragraph comments into
`apps/` and `packages/` TypeScript — narration paid again on every later edit.

## The seal

**Rule for `apps/**/*.ts(x)` and `packages/**/*.ts(x)`** (fixtures excluded):

| Allowed                                         | Forbidden                               |
| ----------------------------------------------- | --------------------------------------- |
| One `//` line, ≤ **12** words, saying _why_     | Any `/* */` / `/** */` block (use `//`) |
| A blank line between unrelated short `//` notes | Stacked `//` lines (a paragraph)        |
| Knowledge in `docs/` / skills                   | Essay headers above functions           |

Enforce: `eslint-rules/comment-prose-lib.mjs` via `npm run comment-prose` (also part of
`npm run lint`).

Per-file debt is frozen in
[`eslint-rules/comment-prose-baseline.json`](../eslint-rules/comment-prose-baseline.json).
A file may **shrink** its prose-word count; it may **not** grow it. New files are absent
from the baseline and therefore have baseline **0**.

```bash
npm run comment-prose                              # report
npm run comment-prose -- apps/api/src/store.ts     # one file
npm run comment-prose -- apps/api/src/foo.ts --write --force   # raise ONE file
npm run comment-prose -- --write --reseal          # reseal every file
```

A file whose prose genuinely grew may raise its own count with `--write --force`
**scoped to that path**. Never run `--write` unscoped: it also lowers every other
baseline to today's count, freezing files nobody touched — the checker now refuses
that without `--reseal`. Same rule and reasoning as
[`module-size-debt.md`](./module-size-debt.md).

Games-repo twin: [`gamedevpl/www.gamedev.pl-games` `docs/comment-prose-debt.md`](https://github.com/gamedevpl/www.gamedev.pl-games/blob/main/docs/comment-prose-debt.md)
(validate Check 34). Keep the word cap and the rule shape aligned.

## Keeping knowledge while deleting words

| Prose shape                         | Keep as                                    | Or move to                                   |
| ----------------------------------- | ------------------------------------------ | -------------------------------------------- |
| Restates the next lines / types     | delete                                     | —                                            |
| Safety / sandbox invariant          | `// No allow-same-origin — sandbox escape` | `docs/architecture.md` / `security-model.md` |
| Why a quota / allowlist edge exists | `// Waitlist: closed-beta gate, not UX`    | plan doc named in the comment                |
| Cross-repo lockstep warning         | `// Lockstep with games-repo DELIVERY`     | `docs/games-repo.md`                         |

**Never** delete a trap marker without a ≤12-word replacement or a doc home. Compliant
one-liners do not count as prose words.

## Cost-effective cleanup

1. **Opportunistic** — any PR that already edits a file shrinks its comments, then
   `npm run comment-prose -- --write`.
2. **Hot-path first** — files agents re-read most (`apps/api/src/app.ts`, submissions,
   Studio / MCP). Cleaning those cuts token spend fastest.
3. **Mechanical batches** — one module (or one heavy file) per PR; comment-only diffs.
4. **LLM assist with a tight contract** — feed violations only; return ≤12-word `//` or
   `DELETE`; reject non-comment edits; re-run `npm run comment-prose`.
5. **Ratchet, never reopen** — do not raise baselines to green CI.

Track with `npm run comment-prose` (heaviest list). Files at 0 drop out of the JSON.
