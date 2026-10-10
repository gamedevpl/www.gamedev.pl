import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { updateCli } from './update.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

it.each(['checking', 'body'])('times out stalled %s without replacing the installed CLI', async (stage) => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-update-timeout-'));
  const dest = join(root, 'gamedevpl');
  writeFileSync(dest, 'existing CLI');
  const bytes = Buffer.from('replacement CLI');
  const hash = createHash('sha256').update(bytes).digest('hex');
  try {
    await expect(
      updateCli({
        dest,
        version: stage === 'checking' ? undefined : '9.0.0',
        timeoutMs: 30,
        fetchImpl: async (url, init) => {
          const signal = init!.signal!;
          if (stage === 'checking')
            return new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            });
          if (url.endsWith('SHA256SUMS')) return new Response(`${hash}  gamedevpl\n`);
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(bytes.subarray(0, 3));
                signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
              },
            }),
          );
        },
      }),
    ).rejects.toMatchObject({
      name: CliError.name,
      exitCode: EXIT_REFUSED,
      message: expect.stringContaining(stage === 'checking' ? 'checking releases' : 'downloading the CLI'),
      next: 'check your connection, then retry gamedevpl update',
    });
    expect(readFileSync(dest, 'utf8')).toBe('existing CLI');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
