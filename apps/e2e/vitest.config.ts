import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Every test here drives a real browser against a real deployment: page loads,
    // SPA hydration, and a generated game booting inside an iframe. The 5s default
    // fails on network latency alone and says nothing about the site.
    testTimeout: 90_000,
    hookTimeout: 120_000,
    // One browser per file, but only one token→session exchange for the whole run:
    // that endpoint allows 20/hour, and spending one per file locks the suite out
    // after a handful of runs (see globalSetup.ts).
    globalSetup: ['./src/globalSetup.ts'],
    // Parallel files would each launch their own browser and multiply the load we put
    // on production for no extra coverage.
    fileParallelism: false,
  },
});
