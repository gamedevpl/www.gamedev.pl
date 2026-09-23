import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // .tsx as well as .ts: the pattern used to be `*.test.ts`, which silently ignored
    // every JSX-authored test in the tree — CreatorQA and HeroPromptSection had test
    // files that never once ran. Files needing a DOM opt in per file with
    // `// @vitest-environment jsdom`.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    // Headroom for CPU contention; these assert behaviour, never latency.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    setupFiles: ['./src/i18nTestSetup.ts'],
  },
});
