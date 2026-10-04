import { afterEach, expect, it, vi } from 'vitest';
import { createArchiveSeedContextSource, SEED_CONTEXT_BREAKER_COOLDOWN_MS } from './seed-context.js';
import { writeTarGz } from '../platform/tar.js';

afterEach(() => vi.useRealTimers());
const base = { repo: 'test/repo', ref: 'sha', token: 'unused' };
it('limits failed downloads, shares the half-open probe and closes after recovery', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  let healthy = false;
  const fetchImpl = vi.fn(async () =>
    healthy
      ? new Response(
          writeTarGz([{ path: 'root/catalog.json', content: '[{"slug":"test","title":"Test","genre":"puzzle"}]' }]),
        )
      : new Response('unavailable', { status: 503 }),
  );
  const warn = vi.fn();
  const source = createArchiveSeedContextSource({ ...base, fetchImpl, log: { warn, info: vi.fn() } });
  for (let i = 0; i < 3; i += 1) expect(await source.load()).toBeNull();
  expect(warn).toHaveBeenCalledWith(expect.objectContaining({ failures: 3 }), 'seed context circuit opened');
  expect(await source.load()).toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  healthy = true;
  vi.setSystemTime(Date.now() + SEED_CONTEXT_BREAKER_COOLDOWN_MS);
  const [a, b] = await Promise.all([source.load(), source.load()]);
  expect(a).not.toBeNull();
  expect(b).toBe(a);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(await source.load()).toBe(a);
});

it('a different snapshot has an independent circuit', async () => {
  const fetchImpl = vi.fn(async () => new Response('unavailable', { status: 503 }));
  const broken = createArchiveSeedContextSource({ ...base, fetchImpl });
  for (let i = 0; i < 3; i += 1) await broken.load();
  await broken.load();
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  await createArchiveSeedContextSource({ ...base, ref: 'new-sha', fetchImpl }).load();
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});
