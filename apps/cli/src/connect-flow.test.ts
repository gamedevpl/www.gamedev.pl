import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, chmodSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { connectSession } from './connect-flow.js';
import { handleReplLine } from './repl.js';
import { checkoutGame } from './checkout.js';
import { runCli } from './main.js';

const dirs: string[] = [];
const directory = () => {
  const dir = mkdtempSync(join(tmpdir(), 'connect-flow-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('offers a fresh standard checkout alongside a detected source repository', async () => {
  const { api, fetch } = fixture();
  const parent = directory();
  const root = join(parent, 'sky');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(
    join(root, 'gamedev-kit.json'),
    JSON.stringify({ engineRef: 'a'.repeat(40), kitSha256: 'b'.repeat(64) }),
  );
  writeFileSync(join(root, 'src/SPEC.md'), '---\nslug: sky\n---\n');
  writeFileSync(join(root, 'src/game.ts'), 'my repository edits');
  const questions: string[][] = [];
  const result = await connectSession({
    api,
    slug: 'sky',
    cwd: root,
    env: { PATH: '' },
    pick: async (choices) => {
      questions.push(choices);
      return choices.find((choice) =>
        choice.startsWith(questions.length === 1 ? 'Create a standard checkout' : 'New directory'),
      )!;
    },
    abort: { current: null },
    write: () => {},
  });
  const dest = join(parent, 'sky-checkout');
  expect(questions[0]![0]).toContain('Continue in existing checkout');
  expect(result?.workshop?.root).toBe(dest);
  expect(readFileSync(join(dest, 'games/sky/SPEC.md'), 'utf8')).toBe('A game to build');
  expect(readFileSync(join(root, 'src/game.ts'), 'utf8')).toBe('my repository edits');
  expect(existsSync(join(root, '.git'))).toBe(false);
  expect(fetch.mock.calls.filter(([url]) => url.includes('/workspace'))).toHaveLength(1);
});

it('creates a standard checkout in cwd when the destination picker chooses dot', async () => {
  const { api } = fixture();
  const root = directory();
  let count = 0;
  const result = await connectSession({
    api,
    slug: 'sky',
    cwd: root,
    env: { PATH: '' },
    pick: async (choices) => {
      count++;
      return count === 1 ? choices[0]! : choices.find((choice) => choice.startsWith('Current directory (.)'))!;
    },
    abort: { current: null },
    write: () => {},
  });
  expect(result?.workshop?.root).toBe(root);
  expect(readFileSync(join(root, 'games/sky/SPEC.md'), 'utf8')).toBe('A game to build');
  expect(existsSync(join(root, 'sky'))).toBe(false);
  expect(existsSync(join(root, '.git'))).toBe(false);
});

it('cancels destination selection without downloading or writing files', async () => {
  const { api, fetch } = fixture();
  const root = directory();
  let count = 0;
  const result = await connectSession({
    api,
    slug: 'sky',
    cwd: root,
    env: { PATH: '' },
    pick: async (choices) => (++count === 1 ? choices[0]! : 'Cancel'),
    abort: { current: null },
    write: () => {},
  });
  expect(result).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(existsSync(join(root, '.git'))).toBe(false);
  expect(existsSync(join(root, 'sky'))).toBe(false);
});

it('suggests a sibling checkout when connecting from another game project', async () => {
  const { api } = fixture();
  const parent = directory();
  const root = join(parent, 'other');
  mkdirSync(root);
  writeFileSync(join(root, '.gamedev-slug'), 'other');
  const result = await connectSession({
    api,
    slug: 'sky',
    cwd: root,
    env: { PATH: '' },
    pick: async (choices) => choices[0]!,
    abort: { current: null },
    write: () => {},
  });
  expect(result?.workshop?.root).toBe(join(parent, 'sky'));
  expect(readFileSync(join(root, '.gamedev-slug'), 'utf8')).toBe('other');
  expect(existsSync(join(root, 'sky'))).toBe(false);
});

it('refuses a fresh dot checkout into a detected project without accessing or replacing platform sources', async () => {
  const { api, fetch } = fixture();
  const root = directory();
  writeFileSync(join(root, '.gamedev-slug'), 'sky');
  writeFileSync(join(root, 'mine.ts'), 'local edits');
  let count = 0;
  await expect(
    connectSession({
      api,
      slug: 'sky',
      cwd: root,
      env: { PATH: '' },
      pick: async (choices) => {
        count++;
        return choices.find((choice) =>
          choice.startsWith(count === 1 ? 'Create a standard checkout' : 'Current directory (.)'),
        )!;
      },
      abort: { current: null },
      write: () => {},
    }),
  ).rejects.toThrow('not empty');
  expect(fetch).not.toHaveBeenCalled();
  expect(readFileSync(join(root, 'mine.ts'), 'utf8')).toBe('local edits');
});

it('honors dot in the standalone checkout command', async () => {
  const { fetch } = fixture();
  const root = directory();
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  vi.stubGlobal('fetch', fetch);
  const io = {
    stdin: new PassThrough() as unknown as NodeJS.ReadStream,
    stdout: new PassThrough() as unknown as NodeJS.WriteStream,
    stderr: new PassThrough() as unknown as NodeJS.WriteStream,
  };
  expect(await runCli(['node', 'cli', 'checkout', 'sky', '.'], { GAMEDEV_TOKEN: 't' }, io)).toBe(0);
  expect(readFileSync(join(root, 'games/sky/SPEC.md'), 'utf8')).toBe('A game to build');
  expect(existsSync(join(root, 'sky'))).toBe(false);
});

it('honors dot in the REPL checkout command and refuses an occupied dot destination', async () => {
  const { api, fetch } = fixture();
  const root = directory();
  const input = { line: '/checkout sky .', api, token: null, cwd: root, env: { PATH: '' }, write: () => {} };
  const opened = await handleReplLine(input);
  expect(opened.workshop?.root).toBe(root);
  expect(readFileSync(join(root, 'games/sky/SPEC.md'), 'utf8')).toBe('A game to build');
  fetch.mockClear();
  const messages: string[] = [];
  const refused = await handleReplLine({ ...input, workshop: opened.workshop, write: (line) => messages.push(line) });
  expect(refused.workshop).toBeUndefined();
  expect(messages.join('\n')).toContain('not empty');
  expect(fetch).not.toHaveBeenCalled();
});
function fixture() {
  const source = directory();
  mkdirSync(join(source, 'games', 'sky'), { recursive: true });
  writeFileSync(join(source, 'games', 'sky', 'SPEC.md'), 'A game to build');
  const archive = execFileSync('tar', ['-czf', '-', '-C', source, '.']);
  const fetch = vi.fn(async (url: string) => {
    if (url.includes('/workspace')) return new Response(new Uint8Array(archive));
    const body = url.includes('/api/me/studio?')
      ? { games: [{ slug: 'sky', token: 'tok' }] }
      : url.endsWith('/versions')
        ? { versions: [] }
        : { slug: 'sky', status: 'queued', phase: 'dispatched', builder: 'self' };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  });
  const api = createApi({
    origin: 'https://example.test',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch,
  });
  return { api, fetch };
}

describe('interactive game connection', () => {
  it('opens choices without contacting MCP or starting an agent when cancelled', async () => {
    const { api, fetch } = fixture();
    const pick = vi.fn(async () => '');
    expect(
      await connectSession({ api, slug: 'sky', env: { PATH: '' }, pick, abort: { current: null }, write: () => {} }),
    ).toBeNull();
    expect(pick.mock.calls.length).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])('reuses dirty child checkout with agent selection (explicit: %s)', async (explicit) => {
    const { api, fetch } = fixture();
    const parent = directory();
    const dest = join(parent, 'sky');
    mkdirSync(join(dest, 'games', 'sky'), { recursive: true });
    writeFileSync(join(dest, '.gamedev-slug'), 'sky');
    const localFile = join(dest, 'games', 'sky', 'game.ts');
    writeFileSync(localFile, 'my unsent changes');
    const bin = join(parent, 'codex');
    writeFileSync(bin, '#!/bin/sh\nexit 0\n');
    chmodSync(bin, 0o755);
    vi.spyOn(process, 'cwd').mockReturnValue(parent);
    const result = await connectSession({
      api,
      slug: 'sky',
      env: { PATH: parent },
      ...(explicit ? { agent: 'codex' } : {}),
      pick: async (choices) => choices?.find((choice) => choice.startsWith('codex —')) ?? '',
      abort: { current: null },
      write: () => {},
    });
    expect(result?.workshop).toMatchObject({ root: dest, selectedAgent: 'codex' });
    expect(readFileSync(localFile, 'utf8')).toBe('my unsent changes');
    expect(fetch.mock.calls.some(([url]) => url.includes('/workspace') || url.includes('/connect'))).toBe(false);
  });

  it('enters chat for the selected game without minting MCP credentials', async () => {
    const { api, fetch } = fixture();
    const result = await connectSession({
      api,
      slug: 'sky',
      env: { PATH: '' },
      pick: async () => 'Continue chatting about this game',
      abort: { current: null },
      write: () => {},
    });
    expect(result).toMatchObject({ slug: 'sky', token: 'tok', conversationId: '' });
    expect(fetch.mock.calls.every(([url]) => !url.includes('/connect'))).toBe(true);
  });

  it('downloads an undelivered game and switches the active REPL workshop', async () => {
    const { api, fetch } = fixture();
    const dest = join(directory(), 'sky');
    const result = await handleReplLine({
      line: `/checkout sky ${dest}`,
      api,
      token: null,
      env: { PATH: '' },
      write: () => {},
    });
    expect(result).toMatchObject({
      slug: 'sky',
      token: 'tok',
      workshop: { root: dest, slug: 'sky', token: 'tok', builder: 'self' },
    });
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/workspace?allowUndelivered=true'))).toBe(true);
    expect(readFileSync(join(dest, 'games', 'sky', 'SPEC.md'), 'utf8')).toBe('A game to build');
    const again = await handleReplLine({
      line: '/checkout',
      api,
      token: 'tok',
      workshop: result.workshop,
      write: () => {},
    });
    expect(again.workshop?.root).toBe(dest);
    expect(fetch.mock.calls.filter(([url]) => url.includes('/workspace'))).toHaveLength(1);
  });

  it('uses the remote session game instead of another checkout in the working directory', async () => {
    const { api } = fixture();
    const parent = directory();
    const other = join(parent, 'other');
    mkdirSync(other);
    writeFileSync(join(other, '.gamedev-slug'), 'other');
    vi.spyOn(process, 'cwd').mockReturnValue(other);
    const result = await handleReplLine({ line: '/checkout', api, token: 'tok', env: { PATH: '' }, write: () => {} });
    expect(result.workshop).toMatchObject({ slug: 'sky', root: join(parent, 'sky') });
    expect(readFileSync(join(other, '.gamedev-slug'), 'utf8')).toBe('other');
  });

  it('refuses an occupied destination before downloading or modifying it', async () => {
    const { api, fetch } = fixture();
    const dest = directory();
    writeFileSync(join(dest, 'mine.ts'), 'local edits');
    await expect(checkoutGame({ api, slug: 'sky', dest })).rejects.toThrow('not empty');
    expect(fetch).not.toHaveBeenCalled();
    expect(readFileSync(join(dest, 'mine.ts'), 'utf8')).toBe('local edits');
  });
});
