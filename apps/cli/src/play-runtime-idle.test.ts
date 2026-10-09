import WebSocket from 'ws';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { PLAY_RUNTIME } from './play-runtime.js';

it('stops the actual preview child after its last consumer leaves, despite health probes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'play-runtime-idle-'));
  mkdirSync(join(root, 'games/robot'), { recursive: true });
  mkdirSync(join(root, 'tools/lib'), { recursive: true });
  symlinkSync(resolve('../../node_modules'), join(root, 'node_modules'), 'dir');
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(
    join(root, 'tools/lib/assemble.ts'),
    'export const assembleGame=()=>({html:"<!doctype html><h1>Game</h1>"});',
  );
  const clock = join(root, 'clock'),
    state = join(root, 'state.json'),
    script = join(root, 'runtime.mjs');
  writeFileSync(clock, '0');
  writeFileSync(
    script,
    `import {readFileSync as readClock} from 'node:fs';const realNow=Date.now;Date.now=()=>realNow()+Number(readClock(process.argv[6],'utf8'));\n${PLAY_RUNTIME}`,
  );
  const child = spawn(process.execPath, [script, root, 'robot', state, 'test-key', clock], { stdio: 'pipe' });
  let output = '';
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  let exited = false;
  const exit = new Promise<void>((resolve) =>
    child.once('exit', () => {
      exited = true;
      resolve();
    }),
  );
  const consumers: WebSocket[] = [];
  try {
    await vi.waitFor(() => expect(readFileSync(state, 'utf8')).toContain('url'), { timeout: 5000 });
    const { url } = JSON.parse(readFileSync(state, 'utf8'));
    await vi.waitFor(async () => expect((await fetch(url + 'status').then((r) => r.json())).busy).toBe(false), {
      timeout: 5000,
    });
    for (let i = 0; i < 2; i++) {
      const socket = new WebSocket((url + 'presence').replace('http:', 'ws:'));
      consumers.push(socket);
      await once(socket, 'open');
    }
    consumers[0]!.close();
    writeFileSync(clock, '120000');
    await new Promise((r) => setTimeout(r, 1100));
    expect(exited, output).toBe(false);
    expect((await fetch(url + 'status')).status).toBe(200);
    consumers[1]!.close();
    let elapsed = 120000;
    await vi.waitFor(
      () => {
        elapsed += 61000;
        writeFileSync(clock, String(elapsed));
        expect(exited, output).toBe(true);
      },
      { timeout: 5000, interval: 1000 },
    );
    await exit;
    expect(child.exitCode, output).toBe(0);
    expect(() => readFileSync(state)).toThrow();
  } finally {
    consumers.forEach((consumer) => consumer.terminate());
    if (!exited) child.kill();
    await exit;
    rmSync(root, { recursive: true, force: true });
  }
});
