import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';

function launch(root: string, args: string[]) {
  const child = spawn(
    process.execPath,
    ['--import', resolve('../../node_modules/tsx/dist/loader.mjs'), resolve('src/main.ts'), ...args],
    {
      cwd: root,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        TMPDIR: root,
        TMP: root,
        TEMP: root,
        XDG_CONFIG_HOME: root,
        GAMEDEV_ORIGIN: 'http://127.0.0.1:9',
        GAMEDEV_TOKEN: '',
        GAMEDEV_ACCESS_TOKEN: '',
        GAMEDEV_HISTORY: 'off',
        GAMEDEV_ALLOW_FILE_KEYCHAIN: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });
  return { child, read: () => output };
}

async function stopped(child: ChildProcess, read: () => string) {
  await vi.waitFor(() => expect(child.exitCode, read()).toBe(0), { timeout: 8000 });
}

it.each([false, true])(
  'runs the actual workbench with detach=%s and preserves its journal on shutdown',
  async (detach) => {
    const root = mkdtempSync(join(tmpdir(), 'play-lifetime-'));
    const { child, read } = launch(root, ['play', '--edit', '--no-open', ...(detach ? ['--detach'] : [])]);
    let pid: number | undefined;
    try {
      let url = '';
      await vi.waitFor(
        () => {
          url = /Play session: (http:\/\/127\.0\.0\.1:\d+\/#[a-f0-9]+)/.exec(read())?.[1] ?? '';
          expect(url, read()).toBeTruthy();
        },
        { timeout: 8000 },
      );
      const key = createHash('sha256').update(root).digest('hex');
      const path = join(root, `gamedev-workbench-${process.getuid?.() ?? 'user'}`, `${key}.json`);
      pid = JSON.parse(readFileSync(path, 'utf8')).pid;
      expect(pid === child.pid).toBe(!detach);
      const parsed = new URL(url);
      const state = await fetch(`${parsed.origin}/state`, {
        headers: { Authorization: `Bearer ${parsed.hash.slice(1)}` },
      }).then((response) => response.json());
      expect(state.detached).toBe(detach);
      if (detach) await stopped(child, read);
      else {
        expect(child.exitCode).toBeNull();
        expect(read()).toContain('Ctrl+C ends Play');
      }
      const reopened = launch(root, ['play', '--edit', '--no-open', ...(detach ? [] : ['--detach'])]);
      try {
        await stopped(reopened.child, reopened.read);
        expect(reopened.read()).toContain('lifetime stays with the original launch');
        expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(pid);
      } finally {
        reopened.child.kill();
      }
      process.kill(pid!, detach ? 'SIGTERM' : 'SIGINT');
      await vi.waitFor(() => expect(JSON.parse(readFileSync(path, 'utf8')).ended, read()).toBe(true), {
        timeout: 8000,
      });
      await stopped(child, read);
      const journal = JSON.parse(readFileSync(path, 'utf8'));
      expect(journal.pid).toBeUndefined();
      expect(journal.url).toBeUndefined();
      await expect(fetch(`${parsed.origin}/state`)).rejects.toThrow();
    } finally {
      try {
        if (pid) process.kill(pid, 'SIGTERM');
      } catch {
        // The session may have already exited.
      }
      child.kill();
      rmSync(root, { recursive: true, force: true });
    }
  },
  20000,
);

it.each([false, true])(
  'runs the actual raw preview with detach=%s and stops it',
  async (detach) => {
    const root = mkdtempSync(join(tmpdir(), 'preview-lifetime-'));
    mkdirSync(join(root, 'games/robot'), { recursive: true });
    mkdirSync(join(root, 'tools/lib'), { recursive: true });
    symlinkSync(resolve('../../node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, '.gamedev-slug'), 'robot');
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    writeFileSync(join(root, 'tools/lib/assemble.ts'), 'export const assembleGame=()=>({html:"<!doctype html>Game"});');
    const { child, read } = launch(root, ['play', '--preview', '--no-open', ...(detach ? ['--detach'] : [])]);
    let url = '';
    try {
      await vi.waitFor(
        () => {
          url = /local live preview: (http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]+\/)/.exec(read())?.[1] ?? '';
          expect(url, read()).toBeTruthy();
        },
        { timeout: 8000 },
      );
      if (detach) {
        await stopped(child, read);
        expect((await fetch(`${url}status`)).ok).toBe(true);
        await fetch(`${url}stop`, { method: 'POST' });
      } else {
        expect(child.exitCode).toBeNull();
        child.kill('SIGINT');
      }
      await stopped(child, read);
      await expect(fetch(`${url}status`)).rejects.toThrow();
    } finally {
      if (url) await fetch(`${url}stop`, { method: 'POST' }).catch(() => undefined);
      child.kill();
      rmSync(root, { recursive: true, force: true });
    }
  },
  20000,
);
