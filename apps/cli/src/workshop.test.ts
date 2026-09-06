import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { loadAdapters } from './adapters.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { parseEventLine } from './delegate.js';
import { memoryStore } from './keychain.js';
import { handleReplLine } from './repl.js';
import {
  describeAdapters,
  detectLocalAdapters,
  openWorkshop,
  settleBuilder,
  syncWarning,
  workshopBrief,
  workshopTurn,
  chooseAdapter,
  refreshBuilder,
  type AdapterRun,
  type Workshop,
} from './workshop.js';

const SLUG = 'airtime';
const claude = loadAdapters().adapters.find((spec) => spec.name === 'claude')!;
const codex = loadAdapters().adapters.find((spec) => spec.name === 'codex')!;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function checkout(files = [{ path: 'game.ts', content: 'A' }]): string {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-ws-'));
  writeGameFiles(root, SLUG, files);
  writeBase(root, 'v1', files);
  writeFileSync(join(root, '.gamedev-slug'), SLUG);
  return root;
}

function platform(seen: string[], extra?: (path: string, init?: RequestInit) => Response | null) {
  return createApi({
    origin: 'https://www.gamedev.pl',
    store: memoryStore({ accessToken: 'gdpl_oat_creator', tokenType: 'Bearer', scope: 'creator' }),
    fetch: async (url, init) => {
      const path = String(url);
      seen.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
      const handled = extra?.(path, init);
      if (handled) return handled;
      if (path.endsWith('/versions')) {
        return json({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] });
      }
      if (path.includes('/tree')) return json({ version: 'v1', files: [{ path: 'game.ts', content: 'A' }] });
      if (path.endsWith('/api/submissions/tok')) return json({ status: 'needs_changes', builder: 'self' });
      if (path.endsWith('/sources')) return json({ files: [] });
      if (path.endsWith('/sources/stage')) return json({ accepted: true });
      if (path.endsWith('/sources/deliver')) return json({ accepted: true, version: 'v2', gateStarted: true });
      if (path.endsWith('/api/cli/chat'))
        return json({
          kind: 'action',
          action: { name: 'edit', request: JSON.parse(String(init?.body)).text },
          conversationId: 'c',
        });
      if (path.endsWith('/turn')) return json({ kind: 'build', roundId: 7, ack: 'Floatier jump.' });
      if (path.endsWith('/handoff')) return json({ accepted: true });
      return json({}, 404);
    },
  });
}

function workshop(root: string, over: Partial<Workshop> = {}): Workshop {
  return {
    slug: SLUG,
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

describe('workshopTurn', () => {
  it('runs the agent in games/<slug> with a brief, no creator token, then delivers', async () => {
    const root = checkout();
    const seen: string[] = [];
    const lines: string[] = [];
    const calls: Parameters<AdapterRun>[0][] = [];
    const runAdapter: AdapterRun = async (input) => {
      calls.push(input);
      writeFileSync(join(input.cwd, 'game.ts'), 'B');
      input.onLine?.('{"type":"assistant","message":{"content":[{"type":"text","text":"Made the jump floatier."}]}}');
      return { code: 0 };
    };
    const ok = await workshopTurn({
      api: platform(seen),
      ws: workshop(root, { runAdapter }),
      request: 'make the jump floatier',
      ack: 'Floatier jump.',
      write: (line) => lines.push(line),
    });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cwd).toBe(join(root, 'games', SLUG));
    expect(calls[0]!.spec.name).toBe('claude');
    expect(calls[0]!.prompt).toContain('make the jump floatier');
    expect(calls[0]!.prompt).toContain('Floatier jump.');
    expect(calls[0]!.prompt).toContain('gamedevpl submit');
    expect(JSON.stringify(calls[0]!.env)).not.toMatch(/gdpl_oat_/);
    expect(lines.join('\n')).toContain('claude ▸ Made the jump floatier.');
    expect(lines.join('\n')).toContain('static ladder green');
    expect(lines.join('\n')).toContain('delivery accepted airtime @ v2');
    expect(seen.some((row) => row.includes('/sources/stage') && row.includes('"content":"B"'))).toBe(true);
    expect(seen.some((row) => row.includes('/sources/deliver'))).toBe(true);
  });

  it('keeps the edit local when the creator declines delivery', async () => {
    const root = checkout();
    const seen: string[] = [];
    const lines: string[] = [];
    const runAdapter: AdapterRun = async (input) => {
      writeFileSync(join(input.cwd, 'game.ts'), 'B');
      return { code: 0 };
    };
    const ok = await workshopTurn({
      api: platform(seen),
      ws: workshop(root, { runAdapter, pick: async (choices) => choices[1]! }),
      request: 'tweak',
      write: (line) => lines.push(line),
    });
    expect(ok).toBe(true);
    expect(lines.join('\n')).toContain('/submit when ready');
    expect(seen.some((row) => row.includes('/sources/deliver'))).toBe(false);
    expect(readFileSync(join(root, 'games', SLUG, 'game.ts'), 'utf8')).toBe('B');
  });

  it('does not offer delivery when the ladder is red', async () => {
    const root = checkout();
    const seen: string[] = [];
    const lines: string[] = [];
    let picks = 0;
    const ok = await workshopTurn({
      api: platform(seen),
      ws: workshop(root, {
        runAdapter: async () => ({ code: 0 }),
        run: (_cmd, args) =>
          args[1] === 'check:static' ? { status: 1, stderr: 'game.ts:3 unused import' } : { status: 0, stderr: '' },
        pick: async (choices) => {
          picks += 1;
          return choices[0]!;
        },
      }),
      request: 'tweak',
      write: (line) => lines.push(line),
    });
    expect(ok).toBe(false);
    expect(picks).toBe(0);
    expect(lines.join('\n')).toContain('verify failed at check_static: game.ts:3 unused import');
    expect(seen.some((row) => row.includes('/sources/deliver'))).toBe(false);
  });

  it('reports a stopped agent instead of verifying half-written files', async () => {
    const root = checkout();
    const lines: string[] = [];
    const ws = workshop(root, {
      runAdapter: async (input) =>
        new Promise((resolve) => input.abort?.addEventListener('abort', () => resolve({ code: null }))),
    });
    const turn = workshopTurn({ api: platform([]), ws, request: 'tweak', write: (line) => lines.push(line) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ws.abort.current).not.toBeNull();
    ws.abort.current!.abort();
    expect(await turn).toBe(false);
    expect(ws.abort.current).toBeNull();
    expect(lines.join('\n')).toContain('claude stopped');
    expect(lines.join('\n')).not.toContain('verifying');
  });

  it('asks which agent when several are installed, and honours --agent', async () => {
    const root = checkout();
    const names: string[] = [];
    const questions: string[] = [];
    const ws = workshop(root, {
      adapters: [claude, codex],
      env: { PATH: root, HOME: root },
      runAdapter: async (input) => (names.push(input.spec.name), { code: 1 }),
      pick: async (choices, question) => (questions.push(question), choices[1]!),
    });
    await workshopTurn({ api: platform([]), ws, request: 'tweak', write: () => undefined });
    expect(questions).toEqual(['Which agent?']);
    expect(names).toEqual(['codex']);
    writeFileSync(join(root, 'claude'), '');
    await workshopTurn({ api: platform([]), ws, request: 'tweak', agent: 'claude', write: () => undefined });
    expect(names).toEqual(['codex', 'claude']);
  });
});

describe('the REPL inside a checkout', () => {
  it('lets the platform chat first, then builds locally when it says build', async () => {
    const root = checkout();
    const seen: string[] = [];
    const lines: string[] = [];
    const prompts: string[] = [];
    const runAdapter: AdapterRun = async (input) => (prompts.push(input.prompt), { code: 0 });
    const ws = workshop(root, { runAdapter, pick: async (choices) => choices[1]! });
    const api = platform(seen, (path, init) =>
      path.endsWith('/api/cli/chat') && String(init?.body).includes('how big')
        ? json({ kind: 'reply', text: 'About 40 files.' })
        : null,
    );
    await handleReplLine({ line: 'how big is it?', api, token: 'tok', workshop: ws, write: (s) => lines.push(s) });
    expect(prompts).toHaveLength(0);
    expect(lines.join('\n')).toContain('About 40 files.');
    await handleReplLine({
      line: 'make the jump floatier',
      api,
      token: 'tok',
      workshop: ws,
      write: (s) => lines.push(s),
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('make the jump floatier');
    expect(lines.join('\n')).toContain('▸ build 7 — Floatier jump.');
  });

  it('/delegate refuses while the platform owns the round', async () => {
    const root = checkout();
    const lines: string[] = [];
    let spawned = 0;
    const ws = workshop(root, { builder: 'platform', runAdapter: async () => ((spawned += 1), { code: 0 }) });
    await handleReplLine({
      line: '/delegate tweak',
      api: platform([]),
      token: 'tok',
      workshop: ws,
      write: (s) => lines.push(s),
    });
    expect(spawned).toBe(0);
    expect(lines.join('\n')).toContain('/builder self');
  });

  it('does not spawn on a checkout the platform has moved past', async () => {
    const root = checkout();
    const lines: string[] = [];
    let spawned = 0;
    const api = platform([], (path) =>
      path.includes('/tree') ? json({ version: 'v2', files: [{ path: 'game.ts', content: 'C' }] }) : null,
    );
    const ws = workshop(root, { runAdapter: async () => ((spawned += 1), { code: 0 }) });
    await handleReplLine({ line: '/delegate tweak', api, token: 'tok', workshop: ws, write: (s) => lines.push(s) });
    expect(spawned).toBe(0);
    expect(lines.join('\n')).toContain('/pull first');
  });

  it('a pending handoff keeps the platform as builder', async () => {
    const root = checkout();
    const lines: string[] = [];
    const api = platform([], (path) =>
      path.endsWith('/handoff') ? json({ ok: true, pending: true, builder: 'platform', target: 'self' }, 202) : null,
    );
    const ws = workshop(root, { builder: 'platform' });
    await handleReplLine({ line: '/builder self', api, token: 'tok', workshop: ws, write: (s) => lines.push(s) });
    expect(ws.builder).toBe('platform');
    expect(lines.join('\n')).toContain('handoff pending');
  });

  it('/builder alone re-reads who owns the round', async () => {
    const root = checkout();
    const lines: string[] = [];
    const api = platform([], (path) =>
      path.endsWith('/api/submissions/tok') ? json({ status: 'needs_changes', builder: 'platform' }) : null,
    );
    const ws = workshop(root);
    await handleReplLine({ line: '/builder', api, token: 'tok', workshop: ws, write: (s) => lines.push(s) });
    expect(ws.builder).toBe('platform');
    expect(lines.join('\n')).toContain('builder platform');
  });

  it('unattended, several agents mean the first one whatever --submit says', async () => {
    const root = checkout();
    const names: string[] = [];
    for (const deliver of [false, true]) {
      const ws = workshop(root, {
        adapters: [claude, codex],
        unattended: { deliver },
        pick: async () => {
          throw new Error('no picks unattended');
        },
        runAdapter: async (input) => (names.push(input.spec.name), { code: 1 }),
      });
      await workshopTurn({ api: platform([]), ws, request: 'tweak', write: () => undefined });
    }
    expect(names).toEqual(['claude', 'claude']);
  });

  it('leaves a platform-built round to the platform and says how to pull', async () => {
    const root = checkout();
    const lines: string[] = [];
    let spawned = 0;
    const ws = workshop(root, { builder: 'platform', runAdapter: async () => ((spawned += 1), { code: 0 }) });
    await handleReplLine({
      line: 'make it harder',
      api: platform([]),
      token: 'tok',
      workshop: ws,
      write: (s) => lines.push(s),
    });
    expect(spawned).toBe(0);
    expect(lines.join('\n')).toContain('/pull when it lands');
  });

  it('/delegate skips the chat and runs the local agent directly', async () => {
    const root = checkout();
    const seen: string[] = [];
    const lines: string[] = [];
    const prompts: string[] = [];
    const ws = workshop(root, {
      runAdapter: async (input) => (prompts.push(input.prompt), { code: 0 }),
      pick: async (choices) => choices[1]!,
    });
    await handleReplLine({
      line: '/delegate add a pause menu',
      api: platform(seen),
      token: 'tok',
      workshop: ws,
      write: (s) => lines.push(s),
    });
    expect(seen.some((row) => row.includes('/turn'))).toBe(false);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('add a pause menu');
    expect(lines.join('\n')).toContain('/submit when ready');
  });

  it('/builder platform hands the round back through the handoff route', async () => {
    const root = checkout();
    const seen: string[] = [];
    const lines: string[] = [];
    const ws = workshop(root);
    await handleReplLine({
      line: '/builder',
      api: platform(seen),
      token: 'tok',
      workshop: ws,
      write: (s) => lines.push(s),
    });
    expect(lines.join('\n')).toContain('builder self');
    await handleReplLine({
      line: '/builder platform',
      api: platform(seen),
      token: 'tok',
      workshop: ws,
      write: (s) => lines.push(s),
    });
    expect(ws.builder).toBe('platform');
    expect(
      seen.some((row) => row.includes('/api/submissions/tok/handoff') && row.includes('"builder":"platform"')),
    ).toBe(true);
    expect(lines.join('\n')).toContain('builder platform');
  });
});

describe('opening a checkout', () => {
  it('retains the chosen agent while a handoff awaits acknowledgement', async () => {
    const ws = workshop(checkout(), {
      builder: 'platform',
      adapters: [claude, codex],
      pick: async (choices) => choices[1]!,
    });
    const api = platform([], (path) =>
      path.endsWith('/handoff') ? json({ pending: true, builder: 'platform' }, 202) : null,
    );
    ws.builder = await settleBuilder({ api, ws, status: 'building', write: () => undefined });
    expect(ws.builder).toBe('platform');
    expect(ws.selectedAgent).toBe('codex');
    await refreshBuilder(api, ws);
    expect(ws.builder).toBe('self');
    ws.pick = async () => {
      throw new Error('must honor the existing choice');
    };
    expect((await chooseAdapter(ws)).name).toBe('codex');
  });
  it('offers every agent and carries the choice into only the first task', async () => {
    const ws = workshop(checkout(), {
      adapters: [claude, codex],
      builder: 'platform',
      pick: async (choices) => choices[1]!,
    });
    expect(await settleBuilder({ api: platform([]), ws, status: 'needs_changes', write: () => undefined })).toBe(
      'self',
    );
    expect(ws.selectedAgent).toBe('codex');
    ws.pick = async (choices) => choices[0]!;
    expect((await chooseAdapter(ws)).name).toBe('codex');
    expect((await chooseAdapter(ws)).name).toBe('claude');
    ws.pick = async () => '/quit';
    await expect(chooseAdapter(ws)).rejects.toThrow('selection cancelled');
  });

  it('describes sync, local agents and the builder', async () => {
    const root = checkout();
    writeFileSync(join(root, 'games', SLUG, 'game.ts'), 'B');
    const lines: string[] = [];
    const opened = await openWorkshop({
      api: platform([]),
      token: 'tok',
      slug: SLUG,
      root,
      env: { PATH: '/nowhere' },
      which: (cmd) => (cmd === 'codex' ? '/usr/bin/codex' : null),
      write: (line) => lines.push(line),
    });
    expect(opened.adapters.map((spec) => spec.name)).toEqual(['codex']);
    expect(opened.builder).toBe('self');
    expect(lines.join('\n')).toContain('base v1 · local only');
    expect(lines.join('\n')).toContain('local-only: game.ts');
    expect(lines.join('\n')).toContain('local agents: codex');
    expect(lines.join('\n')).toContain('builder self · needs_changes');
  });

  it('warns when the platform is ahead of the checkout', () => {
    expect(
      syncWarning({ kind: 'platform_only', version: 'v2', local: [], platform: ['game.ts'], conflict: [] }),
    ).toContain('/pull first');
    expect(syncWarning({ kind: 'clean', version: 'v2', local: [], platform: [], conflict: [] })).toBeNull();
    expect(describeAdapters([])).toContain('no local agent on PATH');
    expect(detectLocalAdapters({ PATH: '/nowhere', HOME: '/nowhere' })).toEqual([]);
  });

  it('offers a local agent the round once, and hands off only when chosen', async () => {
    const seen: string[] = [];
    const lines: string[] = [];
    const base = { token: 'tok', slug: SLUG, adapters: [claude], builder: 'platform' };
    const kept = await settleBuilder({
      api: platform(seen),
      ws: { ...base, pick: async (choices) => choices[1]! },
      status: 'needs_changes',
      write: (line) => lines.push(line),
    });
    expect(kept).toBe('platform');
    expect(seen.some((row) => row.includes('/handoff'))).toBe(false);
    const taken = await settleBuilder({
      api: platform(seen),
      ws: { ...base, pick: async (choices) => choices[0]! },
      status: 'needs_changes',
      write: (line) => lines.push(line),
    });
    expect(taken).toBe('self');
    expect(seen.some((row) => row.includes('/handoff') && row.includes('"builder":"self"'))).toBe(true);
    const published = await settleBuilder({
      api: platform(seen),
      ws: { ...base, pick: async () => 'never asked' },
      status: 'published',
      write: () => undefined,
    });
    expect(published).toBe('platform');
  });

  it('writes a brief that names the game and forbids publishing', () => {
    const brief = workshopBrief(SLUG, 'add a boss');
    expect(brief).toContain('"airtime"');
    expect(brief).toContain('add a boss');
    expect(brief).not.toContain('Studio understood');
    expect(brief).toMatch(/Do not run git/);
  });
});

describe('parseEventLine', () => {
  it('shows the words from claude, codex and plain text events', () => {
    expect(
      parseEventLine(
        '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"},{"type":"tool_use","name":"Edit"}]}}',
      ),
    ).toBe('hi ⚙ Edit');
    expect(parseEventLine('{"type":"item.completed","item":{"type":"agent_message","text":"done"}}')).toBe('done');
    expect(parseEventLine('{"type":"item.completed","item":{"type":"command_execution","command":"npm test"}}')).toBe(
      '⚙ npm test',
    );
    expect(parseEventLine('{"type":"result","result":"all good"}')).toBe('all good');
    expect(parseEventLine('{"text":"plain"}')).toBe('plain');
  });

  it('hides bookkeeping events and non-JSON noise', () => {
    expect(parseEventLine('{"type":"system","subtype":"init"}')).toBeNull();
    expect(parseEventLine('{"type":"thread.started","thread_id":"t"}')).toBeNull();
    expect(parseEventLine('{"type":"user","message":{"content":[{"type":"tool_result"}]}}')).toBeNull();
    expect(parseEventLine('not json')).toBe('not json');
    expect(parseEventLine('')).toBeNull();
  });
});
