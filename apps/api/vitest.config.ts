import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Headroom for CPU contention; these assert behaviour, never latency.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Stops the suite reaching live Vertex through ambient credentials — see the file.
    setupFiles: ['./vitest.setup.ts'],
  },
});
