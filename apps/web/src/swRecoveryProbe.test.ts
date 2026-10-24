// @vitest-environment node

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { replaceBuildManifest } from './shellPrecache.js';

it('lets the shell recovery probe reach the origin even under a stale worker', () => {
  const source = replaceBuildManifest(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    revision: 'stale',
    shell: ['/index.html', '/assets/index-old.js'],
    deferred: [],
  });
  const listeners = new Map<string, (event: unknown) => void>();
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: 'https://example.test' },
      addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    },
  });
  const respondWith = vi.fn();
  listeners.get('fetch')!({
    request: new Request('https://example.test/', { cache: 'reload' }),
    respondWith,
  });
  expect(respondWith).not.toHaveBeenCalled();
});
