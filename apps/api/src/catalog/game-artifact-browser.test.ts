import { afterEach, expect, it, vi } from 'vitest';
import { chromium, type Browser } from 'playwright-core';
import { createGameArtifactBrowser } from './game-artifact-browser.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('keeps publication credentials out of the browser launcher environment', async () => {
  vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/private/publication-credentials.json');
  vi.stubEnv('GAMEDEV_ACCESS_TOKEN', 'fake-fixture-token');
  const launch = vi.spyOn(chromium, 'launch').mockResolvedValue({ close: async () => {} } as Browser);
  const gate = await createGameArtifactBrowser({ executablePath: process.execPath });
  const options = launch.mock.calls[0][0]!;
  expect(options.env).not.toHaveProperty('GOOGLE_APPLICATION_CREDENTIALS');
  expect(options.env).not.toHaveProperty('GAMEDEV_ACCESS_TOKEN');
  expect(options.chromiumSandbox).toBe(true);
  await gate.close();
});
