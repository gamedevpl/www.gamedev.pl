// What a creator is told when their words are refused.

import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { memoryStore } from './keychain.js';
import { submitGame } from './submit.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

const SLUG = 'ghost-roads';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function checkout(files: Array<{ path: string; content: string }>, version = 'v1'): string {
  const dest = mkdtempSync(join(tmpdir(), 'gdpl-refuse-'));
  writeGameFiles(dest, SLUG, files);
  writeBase(dest, version, files);
  writeFileSync(join(dest, '.gamedev-slug'), SLUG);
  return dest;
}

describe('a delivery refused for its prose', () => {
  it.each([
    {
      rejected: 'content_rejected',
      category: 'hate',
      message: /not publishable here \(hate\)/,
      next: /Rewrite the title, description or how-to-play/,
    },
    {
      rejected: 'moderation_unavailable',
      category: undefined,
      message: /content check could not run/,
      next: /Staged files are kept/,
    },
  ])('explains a $rejected delivery and leaves the checkout alone', async (row) => {
    const dest = checkout([{ path: 'game.ts', content: 'A' }]);
    const edited = join(dest, 'games', SLUG, 'game.ts');
    writeFileSync(edited, 'B');
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url) => {
        const path = String(url);
        if (path.endsWith('/versions') && !path.includes('/tree')) {
          return json({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] });
        }
        if (path.includes('/tree')) return json({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] });
        if (path.endsWith('/sources')) return json({ files: [{ path: 'game.ts', content: 'A' }] });
        if (path.endsWith('/sources/stage')) return json({ accepted: true });
        if (path.endsWith('/sources/deliver')) {
          return json({ accepted: false, rejected: row.rejected, ...(row.category ? { category: row.category } : {}) });
        }
        return json({}, 404);
      },
    });

    const failure = await submitGame({ api, slug: SLUG, dest, run: () => ({ status: 0, stderr: '' }) }).catch(
      (error: unknown) => error as CliError,
    );
    expect(failure).toBeInstanceOf(CliError);
    expect(failure.exitCode).toBe(EXIT_REFUSED);
    expect(failure.message).toMatch(row.message);
    expect(failure.next).toMatch(row.next);
    // A refusal is not a reason to touch what the creator wrote.
    expect(readFileSync(edited, 'utf8')).toBe('B');
  });
});
