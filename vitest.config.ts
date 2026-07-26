import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Root-level config for ad-hoc runs like `npx vitest run apps/api/src/foo.test.ts`
 * from the repo root. (Per-package runs — `npm test --workspaces` — use each
 * package's own vitest.config.ts, whose `include` is already package-relative.)
 *
 * Its only job is the exclude: `.claude/worktrees/*` holds git worktrees for other
 * branches, each a full copy of the tree. Without this, a root run collects every
 * branch's copy of a test file — the CLI argument is a path substring filter, not a
 * single path — so results silently mix in code from branches you are not on.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
  },
});
