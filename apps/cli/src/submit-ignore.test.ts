import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { memoryStore } from './keychain.js';
import { formatSubmitLines, submitGame } from './submit.js';

const SLUG = 'ghost-roads';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

describe('push ignore notice', () => {
  it('names ignored files and does not stage them', async () => {
    const dest = mkdtempSync(join(tmpdir(), 'gdpl-ign-sub-'));
    writeGameFiles(dest, SLUG, [{ path: 'game.ts', content: 'A' }]);
    writeBase(dest, 'v1', [{ path: 'game.ts', content: 'A' }]);
    writeFileSync(join(dest, '.gamedev-slug'), SLUG);
    writeFileSync(join(dest, '.gitignore'), '*.log\n');
    writeFileSync(join(dest, '.gamedevplignore'), '*.draft\n');
    writeFileSync(join(dest, 'games', SLUG, 'game.ts'), 'B');
    writeFileSync(join(dest, 'games', SLUG, 'scratch.log'), 'noise');
    writeFileSync(join(dest, 'games', SLUG, 'notes.draft'), 'wip');
    const staged: string[] = [];
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        const path = String(url);
        if (path.endsWith('/versions') && !path.includes('/tree')) {
          return json({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] });
        }
        if (path.includes('/tree')) return json({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] });
        if (path.endsWith('/sources/session'))
          return json({ locked: false, canTakeOver: true, jobId: 10, generation: 1 });
        if (path.endsWith('/sources')) return json({ files: [{ path: 'game.ts', content: 'A' }] });
        if (path.endsWith('/sources/stage') && init?.method === 'PUT') {
          staged.push((JSON.parse(String(init.body ?? '{}')) as { path: string }).path);
          return json({ accepted: true });
        }
        if (path.endsWith('/sources/deliver')) {
          return json({ accepted: true, version: 'v2', mode: 'preview', gateStarted: true });
        }
        return json({}, 404);
      },
    });
    const result = await submitGame({ api, slug: SLUG, dest, run: () => ({ status: 0, stderr: '' }) });
    expect(staged).toEqual(['game.ts']);
    const lines = formatSubmitLines(result, SLUG).join('\n');
    expect(lines).toContain('ignored by .gitignore, not delivered: scratch.log');
    expect(lines).toContain('ignored by .gamedevplignore, not delivered: notes.draft');
    expect(readFileSync(join(dest, 'games', SLUG, 'scratch.log'), 'utf8')).toBe('noise');
  });
});
