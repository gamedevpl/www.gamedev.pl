import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { cleanupHistoryFixtures, sourceLines } from '../test/history-edit-fixture.js';
import { localChangesFixture } from '../test/local-changes-fixture.js';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { runDelegateVerb } from './delegate-command.js';
import { readLocalOperation } from './local-operation.js';
import { readBase } from './checkout.js';

afterEach(cleanupHistoryFixtures);

it('runs a native delegate child through conflict resolution and real checks without a server handoff', async () => {
  const f = localChangesFixture();
  f.draft();
  f.advance();
  await expect(f.pull()).rejects.toThrow('Pull conflicts');
  const bin = join(f.root, 'bin');
  mkdirSync(bin);
  mkdirSync(join(f.root, 'node_modules'));
  const command = join(bin, 'merge-probe');
  writeFileSync(
    command,
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.includes('--help')) { process.stdout.write('merge-probe'); process.exit(0); }
if (process.env.GAMEDEV_TOKEN) throw Error('creator credential leaked');
const prompt = process.argv.at(-1);
const report = prompt.match(/Write a JSON report to this exact path: ([^\\n]+)/)[1];
const state = JSON.parse(fs.readFileSync('.gamedev/merge.json', 'utf8'));
fs.writeFileSync('games/probe/game.ts', ${JSON.stringify(sourceLines(9, 8))});
fs.writeFileSync(report, JSON.stringify({ resolutions: state.conflicts.filter(c => !c.resolved).map(c => ({ path: c.paths[0], choice: 'edited' })) }));
process.stdout.write(JSON.stringify({ message: 'Merged both changes.' }) + '\\n');
`,
  );
  chmodSync(command, 0o700);
  const adapters = join(f.root, 'adapters.json');
  writeFileSync(
    adapters,
    JSON.stringify({
      adapters: [
        {
          name: 'merge-probe',
          command: 'merge-probe',
          versionFlag: '--version',
          headless: [],
          events: { flag: '', dialect: 'jsonl' },
          cwd: 'workspace',
          exit: { success: [0], failure: [1] },
        },
      ],
    }),
  );
  writeFileSync(
    join(f.root, 'package.json'),
    JSON.stringify({
      scripts: {
        typecheck: 'node -e "process.exit(0)"',
        'check:static': 'node -e "process.exit(0)"',
      },
    }),
  );
  const requests: { path: string; method?: string }[] = [];
  const api = createApi({
    origin: f.api.origin,
    store: memoryStore({ accessToken: 'fixture' }),
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push({ path, method: init?.method });
      if (path === '/api/me/studio') return Response.json({ games: [{ slug: 'probe', token: 'tok' }] });
      if (path.endsWith('/recovery')) return Response.json({ kind: 'active' });
      return Response.json(await f.api.request('GET', path));
    },
  });
  const lines: string[] = [];
  expect(
    await runDelegateVerb({
      api,
      args: ['Resolve conflicts'],
      flags: { agent: 'merge-probe' },
      cwd: f.root,
      env: {
        ...process.env,
        PATH: bin + delimiter + process.env.PATH,
        HOME: f.root,
        GAMEDEV_ADAPTERS: adapters,
        GAMEDEV_TOKEN: 'gdpl_oat_test',
      },
      write: (line) => lines.push(line),
    }),
  ).toBe(0);
  expect(readLocalOperation(f.root)).toBeNull();
  expect(readBase(f.root)?.version).toBe('v4');
  expect(readFileSync(join(f.game, 'game.ts'), 'utf8')).toBe(sourceLines(9, 8));
  expect(lines.join('\n')).toContain('static ladder green');
  expect(lines.join('\n')).toContain('Merge completed');
  expect(requests.every((r) => r.method === 'GET')).toBe(true);
  expect(requests.some((r) => /handoff|\/turn|\/api\/submissions/.test(r.path))).toBe(false);
});
