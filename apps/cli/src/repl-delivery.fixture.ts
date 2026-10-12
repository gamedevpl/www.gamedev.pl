import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, vi } from 'vitest';
import { createApi } from './api.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { loadAdapters } from './adapters.js';
import { memoryStore } from './keychain.js';
import { handleReplLine } from './repl.js';
import type { Workshop } from './workshop.js';
import type { VerifyStage } from './verify.js';

export const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
export const BACK = 'Back — keep local changes';
export function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gamedev-delivery-recovery-'));
  roots.push(root);
  const slug = 'example';
  const original = [{ path: 'game.ts', content: 'A' }];
  writeGameFiles(root, slug, original);
  writeBase(root, 'v1', original);
  writeFileSync(join(root, '.gamedev-slug'), slug);
  const source = join(root, 'games', slug, 'game.ts');
  writeFileSync(source, 'B');
  const state = {
    red: true,
    stage: 'check_static' as VerifyStage,
    detail: 'game.ts:3: No matching export for cue',
    locked: false,
    deliveryFailure: undefined as { status: number; body: Record<string, unknown> } | undefined,
    onDelivery: undefined as (() => void) | undefined,
  };
  const requests: { path: string; method: string; body?: Record<string, unknown> }[] = [];
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  const api = createApi({
    origin: 'https://example.test',
    store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push({
        path,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (path.endsWith('/versions'))
        return json({ versions: [{ version: 'v1', createdAt: '2026-09-01', sourceFiles: ['game.ts'] }] });
      if (path.includes('/tree')) return json({ version: 'v1', files: original });
      if (path.endsWith('/api/submissions/tok')) return json({ status: 'needs_changes', builder: 'self' });
      if (path.endsWith('/sources')) return json({ files: original });
      if (path.endsWith('/sources/session'))
        return json(
          init?.method === 'POST'
            ? { accepted: true }
            : { locked: state.locked, canTakeOver: true, jobId: 2, generation: 1 },
        );
      if (path.endsWith('/sources/deliver')) {
        state.onDelivery?.();
        return state.deliveryFailure
          ? json(state.deliveryFailure.body, state.deliveryFailure.status)
          : json({ accepted: true, version: 'v2', gateStarted: true });
      }
      if (path.endsWith('/sources/stage')) return json({ accepted: true });
      return new Response('{}', { status: 404 });
    },
  });
  const checks: string[] = [];
  const lines: string[] = [];
  const pick = vi.fn<Workshop['pick']>(async () => BACK);
  const ws: Workshop = {
    root,
    slug,
    token: 'tok',
    env: { PATH: '/usr/bin', HOME: root },
    adapters: [loadAdapters().adapters.find((a) => a.name === 'claude')!],
    builder: 'self',
    pick,
    abort: { current: null },
    telemetry: { record: vi.fn(), flush: async () => {} },
    run: (_cmd, args) => {
      checks.push(args[1]!);
      const stage = args[1] === 'check:game' ? 'check_game' : args[1] === 'check:static' ? 'check_static' : 'typecheck';
      return state.red && stage === state.stage ? { status: 1, stderr: state.detail } : { status: 0, stderr: '' };
    },
    runAdapter: vi.fn(async () => {
      writeFileSync(source, 'C');
      state.red = false;
      state.deliveryFailure = undefined;
      return { code: 0 };
    }),
  };
  const run = (line = '/push') =>
    handleReplLine({ line, api, token: ws.token, workshop: ws, pick, write: (s) => lines.push(s) });
  const writes = () => requests.filter((r) => ['PUT', 'POST'].includes(r.method));
  return { root, source, ws, api, state, requests, checks, lines, pick, run, writes };
}
