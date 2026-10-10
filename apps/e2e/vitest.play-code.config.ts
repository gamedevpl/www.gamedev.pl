import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/play-local-code.test.ts',
      'src/play-funded-code.test.ts',
      'src/play-maximized-code.test.ts',
      'src/play-drafts-code.test.ts',
    ],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
