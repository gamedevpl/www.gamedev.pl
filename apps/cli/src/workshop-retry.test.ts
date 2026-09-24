import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createApi } from './api.js';
import { loadAdapters } from './adapters.js';
import { writeBase, writeGameFiles } from './checkout.js';
import { memoryStore } from './keychain.js';
import { handleReplLine } from './repl.js';
import type { Workshop } from './workshop.js';

it.each([
  { initialEdit: true, retryEdit: true, completes: true },
  { initialEdit: true, retryEdit: false, completes: true },
  { initialEdit: false, retryEdit: false, completes: false },
])('retry validates retained edits (initial=$initialEdit, retry=$retryEdit)', async (scenario) => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-retry-'));
  const files = [{ path: 'game.ts', content: 'A' }];
  writeGameFiles(root, 'airtime', files);
  writeBase(root, 'v1', files);
  const seen: string[] = [];
  const api = createApi({
    origin: 'https://www.gamedev.pl',
    store: memoryStore({ accessToken: 'gdpl_oat_creator', tokenType: 'Bearer', scope: 'creator' }),
    fetch: async (url, init) => {
      const path = String(url);
      seen.push(`${init?.method ?? 'GET'} ${path}`);
      const json = (data: unknown) =>
        new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      if (path.endsWith('/versions')) return json({ versions: [{ version: 'v1', sourceFiles: ['game.ts'] }] });
      if (path.includes('/tree')) return json({ version: 'v1', files });
      if (path.endsWith('/api/submissions/tok')) return json({ status: 'needs_changes', builder: 'self' });
      if (path.endsWith('/sources')) return json({ files: [] });
      return json({});
    },
  });
  const codex = loadAdapters().adapters.find((spec) => spec.name === 'codex')!;
  const prompts: string[] = [];
  const lines: string[] = [];
  let checks = 0;
  const ws: Workshop = {
    root,
    slug: 'airtime',
    token: 'tok',
    env: { PATH: '/usr/bin', HOME: root },
    adapters: [codex],
    builder: 'self',
    pick: async (choices) => choices[1]!,
    abort: { current: null },
    run: () => {
      checks += 1;
      return { status: 0, stderr: '' };
    },
    runAdapter: async (input) => {
      prompts.push(input.prompt);
      if (prompts.length === 1) {
        if (scenario.initialEdit) writeFileSync(join(input.cwd, 'game.ts'), 'partial');
        return { code: 1 };
      }
      expect(readFileSync(join(input.cwd, 'game.ts'), 'utf8')).toBe(scenario.initialEdit ? 'partial' : 'A');
      if (scenario.retryEdit) writeFileSync(join(input.cwd, 'game.ts'), 'finished');
      return { code: 0 };
    },
  };
  const write = (line: string) => lines.push(line);
  await handleReplLine({ line: '/delegate add three tracks', api, token: 'tok', workshop: ws, write });
  expect(ws.failedTask).toMatchObject({ request: 'add three tracks', ack: undefined, agent: 'codex' });
  expect(lines.join('\n')).toContain('/retry resumes it with codex');
  expect(seen.some((row) => row.includes('/sources/deliver'))).toBe(false);
  await handleReplLine({ line: '/retry', api, token: 'tok', workshop: ws, write });
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain('add three tracks');
  expect(Boolean(ws.failedTask)).toBe(!scenario.completes);
  expect(checks > 0).toBe(scenario.completes);
  expect(seen.some((row) => row.includes('/api/cli/chat') || row.endsWith('/turn'))).toBe(false);
  if (scenario.completes) expect(lines.join('\n')).toContain('/submit when ready');
  else expect(lines.join('\n')).toContain('No game files changed');
});
