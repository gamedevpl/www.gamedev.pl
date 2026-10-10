import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { loadCodeWorker } from './workbench-code-worker.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
it('downloads the versioned worker once, verifies its hash and works offline from cache', async () => {
  const root = mkdtempSync(join(tmpdir(), 'play-worker-'));
  roots.push(root);
  const bytes = gzipSync('self.worker = true;');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const request = vi.fn<typeof fetch>(async () => new Response(bytes));
  const options = { hash, request, env: { XDG_CACHE_HOME: root }, local: pathToFileURL(join(root, 'missing.gz')) };
  expect(await loadCodeWorker(options)).toBe('self.worker = true;');
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toMatch(/\/cli-v[^/]+\/play-typescript-worker\.js\.gz$/);
  expect(await loadCodeWorker(options)).toBe('self.worker = true;');
  expect(request).toHaveBeenCalledTimes(1);
});
it('never serves a downloaded worker whose bytes differ from the embedded hash', async () => {
  const root = mkdtempSync(join(tmpdir(), 'play-worker-'));
  roots.push(root);
  await expect(
    loadCodeWorker({
      hash: '0'.repeat(64),
      request: vi.fn(async () => new Response(gzipSync('untrusted'))),
      env: { XDG_CACHE_HOME: root },
      local: pathToFileURL(join(root, 'missing.gz')),
    }),
  ).rejects.toThrow('checksum');
});
