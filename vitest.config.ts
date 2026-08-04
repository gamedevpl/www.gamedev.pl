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
    // Mirrors apps/api/vitest.config.ts. A root-level ad-hoc run loads this config
    // instead of the package's, and without the setup file an API test invoked that way
    // can reach live Vertex through ambient credentials. The file only sets env vars, so
    // it is harmless for packages that do not need it.
    setupFiles: ['./apps/api/vitest.setup.ts'],
  },
});
