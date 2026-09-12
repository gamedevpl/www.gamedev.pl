import { describe, expect, it, vi } from 'vitest';
import type { GamesStore, SourceFile, VersionManifest } from './games-store.js';
import type { KitFileStore, KitTree } from '../agent-surface/kit-files.js';
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';
import { InMemoryStore } from '../platform/store.js';
import { NoopTranslator } from '../platform/translate.js';
import { createSourceDeliveryService, type SourceDeliveryAuthority } from './source-delivery.js';
import { parseSpecTitle } from '../catalog/github-client.js';
import {
  runTypecheckPreflight,
  sharedSourcesFromKitTree,
  TYPECHECK_PREFLIGHT_MAX_REFUSALS,
} from '../creation/typecheck-preflight.js';

const ISSUE = 701;
const SLUG = 'managed-comet';
const BACKEND = 'managed:fake';
const PINNED = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const KIT_DTS = 'declare const GameKit: { defineGame(): unknown };\n';
const FILES: SourceFile[] = [
  { path: 'SPEC.md', content: '---\ntitle: Managed Comet\n---\n' },
  { path: 'index.html', content: '<!doctype html>' },
  { path: 'game.ts', content: 'export {};' },
];

function treeFor(files: Record<string, string>): KitTree {
  const map = new Map<string, Buffer>();
  for (const [rel, body] of Object.entries(files)) {
    map.set(`${KIT_ROOT_DIR}/${rel}`, Buffer.from(body, 'utf8'));
  }
  return { engineRef: PINNED, sha256: 'a'.repeat(64), files: map };
}

function fakeKitStore(tree: KitTree): KitFileStore {
  return {
    loadRegistry: async () => ({ engineRef: PINNED, previous: null, sha256: 'a'.repeat(64) }),
    loadTree: async () => tree,
    loadCurrentTree: async () => tree,
  };
}

async function setup(kitFileStore: KitFileStore | null) {
  const store = new InMemoryStore();
  await store.createSubmission(ISSUE, 'owner', 'Original title');
  await store.setSubmissionSlug(ISSUE, SLUG);
  await store.recordDispatch(ISSUE, { backend: BACKEND, ref: 'session-701' });
  await store.recordJobTransition(ISSUE, {
    to: 'building',
    at: '2026-08-09T18:00:00.000Z',
    by: 'system',
    reason: 'managed_test',
  });
  const putCandidateSources = vi.fn(async (input: { files: SourceFile[]; kitSharedPaths?: ReadonlySet<string> }) => {
    const manifest = {
      slug: SLUG,
      version: 'v-kit-1',
      createdAt: '2026-08-09T18:00:00.000Z',
      jobId: ISSUE,
      sourceFiles: input.files.map((file) => file.path),
    } as VersionManifest;
    return { version: 'v-kit-1', manifest };
  });
  const service = createSourceDeliveryService({
    store,
    gamesStore: { putCandidateSources, putDerivedArtifact: vi.fn() } as unknown as GamesStore,
    kitFileStore,
    onSourcesDelivered: async () => ({ buildId: 'build-kit-1' }),
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    translator: new NoopTranslator(),
    parseSpecTitle,
    runTypecheckPreflight,
    sharedSourcesFromKitTree,
    typecheckPreflightMaxRefusals: TYPECHECK_PREFLIGHT_MAX_REFUSALS,
  });
  const authority: SourceDeliveryAuthority = {
    backend: BACKEND,
    sessionRef: 'session-701',
    roundGeneration: 1,
  };
  return { store, putCandidateSources, service, authority };
}

describe('source delivery Kit paths', () => {
  it('omits Kit paths when the Kit store is missing', async () => {
    const { putCandidateSources, service, authority } = await setup(null);
    await service.deliver({
      jobId: ISSUE,
      slug: SLUG,
      files: FILES,
      mode: 'preview',
      backend: BACKEND,
      authority,
    });
    expect(putCandidateSources.mock.calls[0]![0]).not.toHaveProperty('kitSharedPaths');
  });

  it('passes pinned Kit paths into upload validation', async () => {
    const kitFileStore = fakeKitStore(
      treeFor({
        'shared/game-kit.d.ts': KIT_DTS,
        'shared/editor-def.ts': 'export function defineEditor() {}\n',
      }),
    );
    const { store, putCandidateSources, service, authority } = await setup(kitFileStore);
    await store.pinRoundKitEngineRef(ISSUE, PINNED);
    await service.deliver({
      jobId: ISSUE,
      slug: SLUG,
      files: FILES,
      mode: 'preview',
      backend: BACKEND,
      authority,
    });
    expect(putCandidateSources.mock.calls[0]![0].kitSharedPaths).toEqual(
      new Set(['shared/editor-def.ts', 'shared/game-kit.d.ts']),
    );
  });
});
