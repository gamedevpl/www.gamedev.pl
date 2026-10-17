import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HistorySourceFile, HistoryVersion } from '@gamedevpl/contract';
import { createApi } from '../src/api.js';
import { memoryStore } from '../src/keychain.js';
import { writeBase, writeGameFiles } from '../src/checkout.js';
import { historyEditCommand } from '../src/history-edit-command.js';

const directories: string[] = [];
export function cleanupHistoryFixtures() {
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
}
export const sourceLines = (first: number, last: number) =>
  [
    `const first = ${first};`,
    ...Array.from({ length: 12 }, (_, i) => `const middle${i} = ${i};`),
    `const last = ${last};`,
    '',
  ].join('\n');
export function historyFixture(project = false) {
  const root = mkdtempSync(join(tmpdir(), 'gamedev-history-edit-'));
  directories.push(root);
  const prefix = project ? 'src' : 'games/probe',
    game = join(root, prefix);
  mkdirSync(game, { recursive: true });
  const spec = '---\nslug: probe\n---\nA fixture game.\n';
  if (project) {
    writeFileSync(
      join(root, 'gamedev-kit.json'),
      JSON.stringify({ engineRef: 'a'.repeat(40), kitSha256: 'b'.repeat(64) }),
    );
    writeFileSync(join(game, 'SPEC.md'), spec);
  } else writeFileSync(join(root, '.gamedev-slug'), 'probe');
  const png = (n: number): HistorySourceFile => ({
    path: 'images/test.png',
    content: Buffer.from([0, 255, n]).toString('base64'),
    encoding: 'base64',
  });
  const trees: Record<string, HistorySourceFile[]> = {
    v1: [{ path: 'game.ts', content: sourceLines(1, 1) }, { path: 'deleted.ts', content: 'restore this\n' }, png(1)],
    v2: [{ path: 'game.ts', content: sourceLines(2, 1) }, { path: 'added.ts', content: 'remove this\n' }, png(2)],
    v3: [
      { path: 'game.ts', content: sourceLines(2, 3) },
      { path: 'added.ts', content: 'remove this\n' },
      { path: 'later.ts', content: 'keep later\n' },
      png(2),
    ],
  };
  if (project) for (const files of Object.values(trees)) files.push({ path: 'SPEC.md', content: spec });
  const versions: HistoryVersion[] = [3, 2, 1].map((n) => ({
    version: `v${n}`,
    createdAt: `2026-10-0${n}T00:00:00Z`,
    sourceFiles: trees[`v${n}`]!.map((f) => f.path),
    jobId: n,
    verdict: 'passed',
  }));
  writeGameFiles(root, 'probe', trees.v3!);
  writeBase(root, 'v3', trees.v3!);
  writeFileSync(join(root, '.gitignore'), `${prefix}/cache.ts\n`);
  writeFileSync(join(game, 'cache.ts'), 'ignored code\n');
  writeFileSync(join(game, 'notes.txt'), 'private notes\n');
  chmodSync(join(game, 'notes.txt'), 0o751);
  mkdirSync(join(game, 'media/empty'), { recursive: true, mode: 0o700 });
  mkdirSync(join(root, '.git'), { recursive: true });
  writeFileSync(join(root, '.git/index'), 'caller index');
  writeFileSync(join(root, '.git/HEAD'), 'caller HEAD');
  const calls: string[] = [],
    control: {
      onRequest?: (url: URL) => void;
      treeResponse?: (version: string, files: HistorySourceFile[]) => HistorySourceFile[];
    } = {};
  const fetchFixture = async (value: string) => {
    const url = new URL(String(value));
    calls.push(url.pathname + url.search);
    control.onRequest?.(url);
    if (url.pathname.endsWith('/versions'))
      return Response.json({ slug: 'probe', versions, hasMore: false, nextCursor: null });
    const version = url.pathname.split('/').at(-2)!;
    if (!trees[version]) return Response.json({ error: 'missing version' }, { status: 404 });
    return Response.json({
      slug: 'probe',
      version,
      metadata: versions.find((row) => row.version === version),
      files: control.treeResponse?.(version, trees[version]!) ?? trees[version],
    });
  };
  const api = createApi({
    origin: 'https://example.invalid',
    store: memoryStore({ accessToken: 'fixture', tokenType: 'Bearer', scope: 'creator' }),
    fetch: fetchFixture,
  });
  const originalBase = readFileSync(join(root, '.gamedev-base.json'), 'utf8');
  const run = async (verb = 'restore', args = ['v1'], flags: Record<string, string | boolean> = {}) => {
    const output: string[] = [];
    await historyEditCommand({
      verb,
      args,
      flags: { json: true, ...flags },
      api,
      cwd: root,
      write: (text) => output.push(text),
    });
    return JSON.parse(output.join('')) as {
      backup: string | null;
      changed: { added: string[]; modified: string[]; deleted: string[] };
      dryRun: boolean;
      recovered?: boolean;
    };
  };
  return { root, game, prefix, api, fetchFixture, trees, versions, calls, control, run, originalBase };
}
