import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Stops the suite reaching live Vertex through ambient credentials — see the file.
    setupFiles: ['./vitest.setup.ts'],
  },
});
