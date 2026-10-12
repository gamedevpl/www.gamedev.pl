import WebSocket from 'ws';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { PLAY_RUNTIME } from './play-runtime.js';

function status(url: URL, headers: Record<string, string>) {
  return new Promise<number>((done, fail) =>
    request(url, { headers }, (res) => {
      res.resume();
      done(res.statusCode!);
    })
      .on('error', fail)
      .end(),
  );
}

it('serves the preview through a forwarded host but refuses cross-origin calls', async () => {
  const root = mkdtempSync(join(tmpdir(), 'play-forwarded-'));
  mkdirSync(join(root, 'games/robot'), { recursive: true });
  mkdirSync(join(root, 'tools/lib'), { recursive: true });
  symlinkSync(resolve('../../node_modules'), join(root, 'node_modules'), 'dir');
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'tools/lib/assemble.ts'), 'export const assembleGame=()=>({html:"<h1>Game</h1>"});');
  const state = join(root, 'state.json'),
    script = join(root, 'runtime.mjs');
  writeFileSync(script, PLAY_RUNTIME);
  const child = spawn(process.execPath, [script, root, 'robot', state, 'test-key'], { stdio: 'ignore' });
  try {
    await vi.waitFor(() => expect(readFileSync(state, 'utf8')).toContain('url'), { timeout: 5000 });
    const url = new URL(JSON.parse(readFileSync(state, 'utf8')).url);
    const host = `space-${url.port}.app.github.dev`;
    const forwarded = `https://${host}`;
    expect(await status(url, { host })).toBe(200);
    expect(await status(new URL('status', url), { host, origin: forwarded })).toBe(200);
    expect(await status(new URL('status', url), { host, origin: 'https://evil.test' })).toBe(403);
    expect(await status(new URL('/wrong-token/status', url), { host })).toBe(404);
    expect(await status(url, {})).toBe(200);
    const presence = (url.href + 'presence').replace('http:', 'ws:');
    const ok = new WebSocket(presence, { headers: { host, origin: forwarded } });
    await once(ok, 'open');
    ok.terminate();
    const evil = new WebSocket(presence, { headers: { host, origin: 'https://evil.test' } });
    await expect(once(evil, 'open')).rejects.toThrow('403');
  } finally {
    child.kill();
    rmSync(root, { recursive: true, force: true });
  }
});
