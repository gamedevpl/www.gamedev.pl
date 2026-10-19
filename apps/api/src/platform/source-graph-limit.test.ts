import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createGitHubClient } from '../catalog/github-client.js';
import { checkSeedBundles } from '../creation/seed-bundle.js';
import { validateSourceUpload, type SourceFile } from '../delivery/games-store.js';
import { DELIVERY_MAX_FILES, MAX_SOURCE_GRAPH_MODULES } from './games-repo-contract.js';

function graph(moduleCount: number): SourceFile[] {
  return [
    {
      path: 'game.ts',
      content: Array.from({ length: moduleCount - 1 }, (_, index) => `import './game/module-${index}.ts';`).join('\n'),
    },
    ...Array.from({ length: moduleCount - 1 }, (_, index) => ({
      path: `game/module-${index}.ts`,
      content: 'globalThis.loadedModules = (globalThis.loadedModules ?? 0) + 1;',
    })),
  ];
}

function delivery(): SourceFile[] {
  return [
    ...graph(DELIVERY_MAX_FILES - 5),
    { path: 'SPEC.md', content: '---\ntitle: Large graph\n---\n' },
    {
      path: 'GAME.json',
      content: JSON.stringify({
        engine: { modules: [] },
        howToPlay: {
          goal: { en: 'Survive', pl: 'Przetrwaj' },
          hint: { en: 'Keep moving', pl: 'Nie zatrzymuj się' },
        },
      }),
    },
    { path: 'TRACE.json', content: '{"samples":[]}' },
    { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
    { path: 'AGENT.json', content: '{"policy":"capture"}' },
  ];
}

function clientFor(files: SourceFile[], shared: SourceFile[] = []) {
  const sources = new Map(files.map((file) => [`games/large-graph/${file.path}`, file.content]));
  for (const file of shared) sources.set(file.path, file.content);
  sources.set('shared/game-shell.css', '.shell { display: grid; }');
  sources.set('shared/modules/core.ts', 'window.GameKit = {};');
  return createGitHubClient({
    token: 'test-token',
    repo: 'gamedevpl/www.gamedev.pl-games',
    files: {
      readText: async (path) => sources.get(path) ?? null,
      readBytes: async () => null,
      listPaths: () => [...sources.keys()],
    },
    fetchImpl: async () => {
      throw new Error('source graph tests must not use the network');
    },
  });
}

describe('delivery and bundler source graph limits', () => {
  it('uploads, seed-checks and serves a connected 300-file delivery', async () => {
    const files = validateSourceUpload(delivery());
    expect(files).toHaveLength(300);
    expect(await checkSeedBundles('large-graph', files)).toEqual({ ok: true });
    const sources = await clientFor(files).getGameSources('main', 'large-graph');
    expect(sources).not.toBeNull();
    const context = { window: {}, loadedModules: 0 };
    runInNewContext(sources!.gameJs, context, { timeout: 1000 });
    expect(context.loadedModules).toBe(294);
  });

  it('keeps the seed graph bounded at the shared module ceiling', async () => {
    expect(MAX_SOURCE_GRAPH_MODULES).toBeGreaterThan(DELIVERY_MAX_FILES);
    expect(await checkSeedBundles('large-graph', graph(MAX_SOURCE_GRAPH_MODULES))).toEqual({ ok: true });
    const result = await checkSeedBundles('large-graph', graph(MAX_SOURCE_GRAPH_MODULES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join('\n')).toContain(`exceeds ${MAX_SOURCE_GRAPH_MODULES} TypeScript modules`);
  });

  it('leaves room for shared simulation imports above the delivery file count', async () => {
    const shared = Array.from({ length: 6 }, (_, index) => ({
      path: `shared/sim/helper-${index}.ts`,
      content: 'globalThis.loadedShared = (globalThis.loadedShared ?? 0) + 1;',
    }));
    const imports = shared.map((file) => `import '../../${file.path}';`).join('\n');
    const files = validateSourceUpload(
      delivery().map((file) => (file.path === 'game.ts' ? { ...file, content: imports + '\n' + file.content } : file)),
    );
    expect(files).toHaveLength(300);
    const sources = await clientFor(files, shared).getGameSources('main', 'large-graph');
    expect(sources).not.toBeNull();
    const context = { window: {}, loadedModules: 0, loadedShared: 0 };
    runInNewContext(sources!.gameJs, context, { timeout: 1000 });
    expect(context.loadedModules).toBe(294);
    expect(context.loadedShared).toBe(6);
  });

  it('keeps the serve graph bounded at the same ceiling', async () => {
    const files = delivery().filter((file) => !file.path.endsWith('.ts'));
    const atLimit = clientFor([...files, ...graph(MAX_SOURCE_GRAPH_MODULES)]);
    expect(await atLimit.getGameSources('main', 'large-graph')).not.toBeNull();
    const overLimit = clientFor([...files, ...graph(MAX_SOURCE_GRAPH_MODULES + 1)]);
    await expect(overLimit.getGameSources('main', 'large-graph')).rejects.toThrow(
      `exceeds ${MAX_SOURCE_GRAPH_MODULES} TypeScript modules`,
    );
  });
});
