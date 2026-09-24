import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { loadAdapters } from './adapters.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { memoryStore } from './keychain.js';
import { handleReplLine } from './repl.js';
import type { Workshop } from './workshop.js';

const slug = 'airtime';
const claude = loadAdapters().adapters.find((spec) => spec.name === 'claude')!;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function checkout(): string {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-builder-'));
  const files = [{ path: 'game.ts', content: 'A' }];
  writeGameFiles(root, slug, files);
  writeBase(root, 'v1', files);
  writeFileSync(join(root, '.gamedev-slug'), slug);
  return root;
}

function platform(seen: string[], extra?: (path: string) => Response | null) {
  return createApi({
    origin: 'https://www.gamedev.pl',
    store: memoryStore({ accessToken: 'gdpl_oat_creator', tokenType: 'Bearer', scope: 'creator' }),
    fetch: async (url, init) => {
      const path = String(url);
      seen.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
      const handled = extra?.(path);
      if (handled) return handled;
      if (path.endsWith('/versions')) return json({ versions: [{ version: 'v1', sourceFiles: ['game.ts'] }] });
      if (path.includes('/tree')) return json({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] });
      if (path.endsWith('/api/submissions/tok')) return json({ status: 'needs_changes', builder: 'self' });
      if (path.endsWith('/sources')) return json({ files: [] });
      if (path.endsWith('/sources/stage')) return json({ accepted: true });
      if (path.endsWith('/sources/deliver')) return json({ accepted: true, version: 'v2', gateStarted: true });
      if (path.endsWith('/handoff')) return json({ accepted: true });
      return json({}, 404);
    },
  });
}

function workshop(root: string, over: Partial<Workshop> = {}): Workshop {
  return {
    slug,
    root,
    token: 'tok',
    env: { PATH: '/usr/bin', HOME: root, GAMEDEV_TOKEN: 'gdpl_oat_creator' },
    adapters: [claude],
    builder: 'self',
    pick: async (choices) => choices[0]!,
    abort: { current: null },
    run: () => ({ status: 0, stderr: '' }),
    runAdapter: async () => ({ code: 0 }),
    ...over,
  };
}

describe('builder choice in a checkout', () => {
  it('/delegate offers a local handoff while the platform owns the round', async () => {
    const root = checkout();
    const seen: string[] = [];
    const lines: string[] = [];
    let spawned = 0;
    const ws = workshop(root, {
      builder: 'platform',
      pick: async (choices) => choices[1]!,
      runAdapter: async () => ((spawned += 1), { code: 0 }),
    });
    await handleReplLine({
      line: '/delegate tweak',
      api: platform(seen),
      token: 'tok',
      workshop: ws,
      write: (s) => lines.push(s),
    });
    expect(spawned).toBe(0);
    expect(ws.builder).toBe('platform');
    expect(seen.some((row) => row.includes('/handoff'))).toBe(false);
  });

  it('/delegate runs after choosing a local builder', async () => {
    const root = checkout();
    const seen: string[] = [];
    const lines: string[] = [];
    let spawned = 0;
    const ws = workshop(root, {
      builder: 'platform',
      runAdapter: async (input) => {
        spawned += 1;
        writeFileSync(join(input.cwd, 'game.ts'), 'B');
        return { code: 0 };
      },
    });
    await handleReplLine({
      line: '/delegate tweak',
      api: platform(seen),
      token: 'tok',
      workshop: ws,
      write: (s) => lines.push(s),
    });
    expect(ws.builder).toBe('self');
    expect(spawned).toBe(1);
    expect(seen.some((row) => row.includes('/handoff') && row.includes('"builder":"self"'))).toBe(true);
  });

  it('/delegate waits for a pending handoff before editing', async () => {
    const root = checkout();
    const lines: string[] = [];
    let spawned = 0;
    const ws = workshop(root, { builder: 'platform', runAdapter: async () => ((spawned += 1), { code: 0 }) });
    const api = platform([], (path) =>
      path.endsWith('/handoff') ? json({ pending: true, builder: 'platform' }, 202) : null,
    );
    await handleReplLine({ line: '/delegate tweak', api, token: 'tok', workshop: ws, write: (s) => lines.push(s) });
    expect(ws.builder).toBe('platform');
    expect(spawned).toBe(0);
    expect(lines.join('\n')).toContain('Handoff pending');
  });

  it('/builder alone re-reads ownership and offers a menu', async () => {
    const root = checkout();
    const lines: string[] = [];
    const api = platform([], (path) =>
      path.endsWith('/api/submissions/tok') ? json({ status: 'needs_changes', builder: 'platform' }) : null,
    );
    const questions: string[] = [];
    const ws = workshop(root, {
      pick: async (_choices, question) => (questions.push(question), 'Cancel'),
    });
    await handleReplLine({ line: '/builder', api, token: 'tok', workshop: ws, write: (s) => lines.push(s) });
    expect(ws.builder).toBe('platform');
    expect(questions[0]).toContain('Builder: platform');
    expect(lines).toEqual([]);
  });

  it('/builder menu switches to the platform when selected', async () => {
    const root = checkout();
    const seen: string[] = [];
    const ws = workshop(root, { pick: async (choices) => choices[1]! });
    await handleReplLine({ line: '/builder', api: platform(seen), token: 'tok', workshop: ws, write: () => undefined });
    expect(ws.builder).toBe('platform');
    expect(seen.some((row) => row.includes('/handoff') && row.includes('"builder":"platform"'))).toBe(true);
  });
});
