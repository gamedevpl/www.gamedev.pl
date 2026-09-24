import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { isDeliverablePath } from '@gamedevpl/contract';
import { createApi } from './api.js';
import { diffGame, pullGame, writeBase, writeGameFiles } from './checkout.js';
import { memoryStore } from './keychain.js';
import { formatSubmitLines, submitGame } from './submit.js';

const SLUG = 'ghost-roads';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

const GAME = [
  { path: 'SPEC.md', content: 'brief' },
  { path: 'GAME.json', content: '{}' },
  { path: 'TRACE.json', content: '{}' },
  { path: 'game.ts', content: 'A' },
  { path: 'sim.ts', content: 'S' },
  { path: 'game/level.ts', content: 'L' },
  { path: 'images/hero.png', content: 'iVBORw0KGgo=' },
];

const NOTES = 'NOTATKI-I-POMYSLY.md';

function checkoutWithNotes(): string {
  const dest = mkdtempSync(join(tmpdir(), 'gdpl-not-game-'));
  writeGameFiles(dest, SLUG, GAME);
  writeBase(dest, 'v1', GAME);
  writeFileSync(join(dest, '.gamedev-slug'), SLUG);
  writeFileSync(join(dest, 'games', SLUG, NOTES), '# pomysły\n');
  mkdirSync(join(dest, 'games', SLUG, 'media'), { recursive: true });
  writeFileSync(join(dest, 'games', SLUG, 'media', 'cover.png'), 'x');
  return dest;
}

function platform(
  tree: Array<{ path: string; content: string }>,
  staged: string[],
  deleted: string[] = [],
  locked = false,
) {
  return createApi({
    origin: 'https://www.gamedev.pl',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch: async (url, init) => {
      const path = String(url);
      if (path.endsWith('/versions') && !path.includes('/tree')) {
        return json({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: tree.map((f) => f.path) }] });
      }
      if (path.includes('/tree')) return json({ version: 'v1', files: tree });
      if (path.endsWith('/sources/session'))
        return json(
          init?.method === 'POST' ? { accepted: true } : { locked, canTakeOver: true, jobId: 10, generation: 1 },
        );
      if (path.endsWith('/sources')) return json({ files: tree });
      if (path.endsWith('/sources/stage') && init?.method === 'PUT') {
        staged.push((JSON.parse(String(init.body ?? '{}')) as { path: string }).path);
        return json({ accepted: true });
      }
      if (path.endsWith('/sources/stage/delete')) {
        deleted.push((JSON.parse(String(init?.body ?? '{}')) as { path: string }).path);
        return json({ accepted: true });
      }
      if (path.endsWith('/sources/deliver')) return json({ accepted: true, version: 'v2', mode: 'preview' });
      return json({}, 404);
    },
  });
}

describe('non-game files in the game directory', () => {
  it('keeps a notes file local and still delivers every game file', async () => {
    const dest = checkoutWithNotes();
    const staged: string[] = [];
    const deleted: string[] = [];
    const api = platform(GAME, staged, deleted, true);
    const result = await submitGame({ api, slug: SLUG, dest, takeover: true, run: () => ({ status: 0, stderr: '' }) });
    expect(result.kind).toBe('delivered');
    expect(staged).toEqual(GAME.map((file) => file.path).sort());
    expect(staged.every(isDeliverablePath)).toBe(true);
    expect(deleted).toEqual([]);
    expect(formatSubmitLines(result, SLUG)).toContain(
      `Kept local (not game files): ${NOTES}, media/cover.png — add to .gitignore to silence`,
    );
    expect(readFileSync(join(dest, 'games', SLUG, NOTES), 'utf8')).toBe('# pomysły\n');
  });

  it('does not stage a new notes file as a local change', async () => {
    const dest = checkoutWithNotes();
    writeFileSync(join(dest, 'games', SLUG, 'game.ts'), 'B');
    const staged: string[] = [];
    const result = await submitGame({
      api: platform(GAME, staged),
      slug: SLUG,
      dest,
      run: () => ({ status: 0, stderr: '' }),
    });
    expect(result.kind).toBe('delivered');
    expect(staged).toEqual(['game.ts']);
  });

  it('diff reads clean and pull never deletes the notes file', async () => {
    const dest = checkoutWithNotes();
    const report = await diffGame({ api: platform(GAME, []), slug: SLUG, dest });
    expect(report.kind).toBe('clean');
    expect(report.ignored.map((hit) => `${hit.source}:${hit.path}`)).toEqual(
      expect.arrayContaining([`not-game:${NOTES}`, 'not-game:media/cover.png']),
    );

    const next = GAME.map((file) => (file.path === 'game.ts' ? { ...file, content: 'A2' } : file));
    const pulled = await pullGame({ api: platform(next, []), slug: SLUG, dest });
    expect(pulled.sync.kind).toBe('platform_only');
    expect(readFileSync(join(dest, 'games', SLUG, 'game.ts'), 'utf8')).toBe('A2');
    expect(existsSync(join(dest, 'games', SLUG, NOTES))).toBe(true);

    await pullGame({ api: platform(next, []), slug: SLUG, dest, force: true });
    expect(existsSync(join(dest, 'games', SLUG, NOTES))).toBe(true);
    expect(existsSync(join(dest, 'games', SLUG, 'media', 'cover.png'))).toBe(true);
  });
});
