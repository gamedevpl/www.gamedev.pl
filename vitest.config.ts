import { fileURLToPath } from 'node:url';
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
    //
    // Absolute, resolved from this file rather than written as './apps/api/…'. Workspaces
    // with no vitest.config.ts of their own — packages/zone-core — walk up and load THIS
    // config while running in their own directory, where a relative path resolves to
    // packages/zone-core/apps/api/vitest.setup.ts and every test in that package fails to
    // collect. That is exactly how it broke master's CI on 2026-08-04.
    setupFiles: [fileURLToPath(new URL('./apps/api/vitest.setup.ts', import.meta.url))],
  },
});
