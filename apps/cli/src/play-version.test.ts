import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { startLocalPlay } from './play.js';
import { previewKey } from './play-sessions.js';
import { privatePlayDirectory } from './play-state.js';
import { CLI_VERSION } from './update.js';
import { launchWorkbench, savePlayJournal } from './workbench-launch.js';

it('replaces a legacy preview under its startup lock and reuses the current server', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-preview-version-'));
  const key = previewKey(root, 'robot');
  const registry = privatePlayDirectory(join(tmpdir(), `gamedev-play-${process.getuid?.() ?? 'user'}`));
  const statePath = join(registry, `${key}.json`);
  mkdirSync(join(root, 'tools/lib'), { recursive: true });
  writeFileSync(join(root, 'tools/lib/assemble.ts'), 'export const assembleGame=()=>({html:"<h1>Game</h1>"});');
  symlinkSync(resolve('../../node_modules'), join(root, 'node_modules'), 'dir');
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  let stops = 0;
  const legacy = createServer((req, res) => {
    if (req.url?.endsWith('/stop')) {
      stops++;
      rmSync(statePath, { force: true });
      res.end('stopped');
    } else res.end(JSON.stringify({ key }));
  });
  await new Promise<void>((resolve) => legacy.listen(0, '127.0.0.1', resolve));
  const oldUrl = `http://127.0.0.1:${(legacy.address() as { port: number }).port}/${'a'.repeat(48)}/`;
  writeFileSync(statePath, JSON.stringify({ url: oldUrl, key, cliVersion: CLI_VERSION }), { mode: 0o600 });
  const write = vi.fn();
  const input = { root, slug: 'robot', env: process.env, prepared: true, write };
  try {
    const [first, second] = await Promise.all([startLocalPlay(input), startLocalPlay(input)]);
    expect(stops).toBe(1);
    expect(first!.url).toBe(second!.url);
    expect(first!.url).not.toBe(oldUrl);
    expect(first!.cliVersion).toBe(CLI_VERSION);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('Restarting preview from an older CLI'));
    expect((await startLocalPlay(input))!.url).toBe(first!.url);
  } finally {
    await startLocalPlay({ ...input, stop: true });
    legacy.closeAllConnections();
    await new Promise<void>((resolve) => legacy.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

it('gives a restart action for an older workspace without stopping its active work', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-workbench-version-'));
  const registry = privatePlayDirectory(join(tmpdir(), `gamedev-workbench-${process.getuid?.() ?? 'user'}`));
  const path = join(registry, createHash('sha256').update(root).digest('hex') + '.json');
  const server = createServer((_req, res) => res.end('{}'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/#${'a'.repeat(64)}`;
  savePlayJournal(path, { version: 1, instance: 'old', cwd: root, url });
  const foreground = vi.fn();
  try {
    await expect(
      launchWorkbench({ cwd: root, entry: 'cli', env: {}, noOpen: true, write: vi.fn(), foreground }),
    ).rejects.toMatchObject({ next: expect.stringContaining('gamedevpl stop, then gamedevpl play') });
    expect(foreground).not.toHaveBeenCalled();
    expect((await fetch(new URL(url).origin)).ok).toBe(true);
  } finally {
    rmSync(path, { force: true });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
