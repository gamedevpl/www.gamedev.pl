import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPlayRequest, playGame, startLocalPlay } from './play.js';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(
  url: string,
  predicate: (state: { revision: string; error: string; busy?: boolean }) => boolean,
) {
  for (let i = 0; i < 80; i++) {
    const state = await fetch(url + 'status').then((r) => r.json());
    if (predicate(state)) return state;
    await pause(150);
  }
  throw new Error('preview did not reach expected state');
}

describe('play', () => {
  it.each([
    'chcę zagrać w tę gierkę',
    'chce zagrac w ta gierke!',
    'Chcę pograć',
    'I want to play this game',
    "let's play",
    'uruchom grę',
    'otwórz tę gierkę',
    'launch this game',
  ])('recognizes an explicit play request: %s', (text) => expect(isPlayRequest(text)).toBe(true));
  it.each([
    'make a game I want to play',
    'chcę zagrać, ale najpierw dodaj bossa',
    'how do I play?',
    'build a platformer',
    'uruchom testy',
    'uruchom airtime i dodaj bossa',
  ])('does not swallow another intent: %s', (text) => expect(isPlayRequest(text)).toBe(false));
  it.each(['uruchom airtime', 'Odpal AIRTIME!', 'otwórz airtime', 'play airtime', 'launch airtime', 'start airtime'])(
    'recognizes the active checkout by name: %s',
    (text) => expect(isPlayRequest(text, 'airtime')).toBe(true),
  );
  it.each(['uruchom testy', 'start server', 'uruchom airtime i dodaj bossa', 'uruchom robot'])(
    'preserves non-play requests in a checkout: %s',
    (text) => expect(isPlayRequest(text, 'airtime')).toBe(false),
  );
  it('opens a remote game without API requests or local setup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gdpl-remote-'));
    try {
      const urls: string[] = [];
      const result = await playGame({
        cwd: root,
        slug: 'robot',
        origin: 'https://example.test',
        write: () => undefined,
        open: async (url) => {
          urls.push(url);
          return true;
        },
      });
      expect(result.mode).toBe('remote');
      expect(urls).toEqual(['https://example.test/play/robot']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('reuses a server, reloads successful edits, keeps the last good game on error and stops', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gdpl-play-'));
    mkdirSync(join(root, 'games/robot'), { recursive: true });
    mkdirSync(join(root, 'tools/lib'), { recursive: true });
    mkdirSync(join(root, 'templates'));
    writeFileSync(join(root, 'templates/title.txt'), '');
    symlinkSync(resolve('../../node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    writeFileSync(join(root, '.gamedev-slug'), 'robot');
    const source = join(root, 'games/robot/game.html');
    writeFileSync(source, '<!doctype html><h1>First</h1>');
    writeFileSync(
      join(root, 'tools/lib/assemble.ts'),
      `import {readFileSync} from 'node:fs'; export function assembleGame(slug) { const html=readFileSync('games/'+slug+'/game.html','utf8'); if(html==='broken') throw new Error('compile failed'); return {html: html + readFileSync('templates/title.txt', 'utf8')}; }`,
    );
    const input = { root, slug: 'robot', env: process.env, write: () => undefined };
    try {
      const [first, second] = await Promise.all([startLocalPlay(input), startLocalPlay(input)]);
      expect(first!.url).toBe(second!.url);
      const a = await eventually(first!.url, (state) => Boolean(state.revision));
      const shell = await fetch(first!.url).then((r) => r.text());
      expect(shell).toContain('sandbox="allow-scripts allow-pointer-lock"');
      expect(shell).not.toContain('allow-same-origin');
      expect((await fetch(first!.url + 'game')).headers.get('content-type')).toContain('text/plain');
      expect((await fetch(first!.url + 'status', { headers: { Origin: 'https://evil.test' } })).status).toBe(403);
      writeFileSync(source, '<!doctype html><h1>Second</h1>');
      const b = await eventually(first!.url, (state) => Boolean(state.revision) && state.revision !== a.revision);
      writeFileSync(source, 'broken');
      const red = await eventually(first!.url, (state) => state.error.includes('compile failed'));
      expect(red.revision).toBe(b.revision);
      expect(await fetch(first!.url + 'game').then((r) => r.text())).toContain('Second');
      writeFileSync(source, '<!doctype html><h1>Recovered</h1>');
      await eventually(first!.url, (state) => !state.error && state.revision !== b.revision);
      const recovered = await eventually(first!.url, (state) => !state.error);
      writeFileSync(join(root, 'templates/title.txt'), 'template changed');
      await eventually(first!.url, (state) => state.revision !== recovered.revision && !state.error);
      writeFileSync(source, '<html>' + 'x'.repeat(26_534_288) + '</html>');
      await eventually(first!.url, (state) => !state.error && state.revision !== recovered.revision && !state.busy);
      for (let i = 0; i < 60; i++) {
        const response = await fetch(first!.url + 'game');
        const bytes = Number(response.headers.get('content-length'));
        await response.body?.cancel();
        if (bytes > 26_534_288) break;
        await pause(150);
      }
      expect((await fetch(first!.url + 'game').then((r) => r.text())).length).toBeGreaterThan(26_534_288);
      await startLocalPlay({ ...input, stop: true });
      await expect(fetch(first!.url + 'status')).rejects.toThrow();
    } finally {
      await startLocalPlay({ ...input, stop: true });
      rmSync(root, { recursive: true, force: true });
    }
  }, 25000);
});
