import { beforeAll } from 'vitest';
import { preloadInlineFrameAdapter } from './frameAdapter.js';

// Runs after each file's vi.mock calls, keeping mocked parsers.
beforeAll(async () => {
  await preloadInlineFrameAdapter();
});
