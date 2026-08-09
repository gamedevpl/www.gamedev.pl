import { describe, expect, it, vi } from 'vitest';
import type { GamesStore, SourceFile, VersionManifest } from './games-store.js';
import { InvalidUploadError } from './games-store.js';
import type { KitFileStore, KitTree } from './kit-files.js';
import { KIT_ROOT_DIR } from './kit-registry.js';
import { InMemoryStore } from './store.js';
import {
  createSourceDeliveryService,
  SourceDeliveryAuthorityError,
  type SourceDeliveryAuthority,
} from './source-delivery.js';

const ISSUE = 701;
const SLUG = 'managed-comet';
const BACKEND = 'managed:fake';
const SESSION = 'session-701';

const PREVIEW_FILES: SourceFile[] = [
  { path: 'SPEC.md', content: '---\ntitle: Managed Comet\n---\n' },
  { path: 'index.html', content: '<!doctype html>' },
  { path: 'game.ts', content: 'export {};' },
];

const PUBLISH_FILES: SourceFile[] = [
  ...PREVIEW_FILES,
  { path: 'TRACE.json', content: '{"samples":[]}' },
  { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
];

function manifest(files: SourceFile[], version: string): VersionManifest {
  return {
    slug: SLUG,
    version,
    createdAt: '2026-08-09T18:00:00.000Z',
    issueNumber: ISSUE,
    sourceFiles: files.map((file) => file.path),
  };
}

const KIT_DTS = `
interface GameKitGameContext { width: number; height: number; }
declare const GameKit: { defineGame(): unknown };
`;

function fakeKitStore(trees: Record<string, KitTree>): KitFileStore {
  return {
    loadRegistry: async () => ({ engineRef: Object.keys(trees)[0]!, previous: null, sha256: 'a'.repeat(64) }),
    loadTree: async (engineRef?: string) => {
      const ref = engineRef ?? Object.keys(trees)[0]!;
      const tree = trees[ref];
      if (!tree) throw new Error(`missing kit ${ref}`);
      return tree;
    },
    loadCurrentTree: async () => trees[Object.keys(trees)[0]!]!,
  };
}

function treeFor(engineRef: string, kitDts: string): KitTree {
  return {
    engineRef,
    sha256: 'a'.repeat(64),
    files: new Map([[`${KIT_ROOT_DIR}/shared/game-kit.d.ts`, Buffer.from(kitDts, 'utf8')]]),
  };
}

async function setup(opts?: { kitFileStore?: KitFileStore | null }) {
  const store = new InMemoryStore();
  await store.createSubmission(ISSUE, 'owner', 'Original title');
  await store.setSubmissionSlug(ISSUE, SLUG);
  await store.recordDispatch(ISSUE, { backend: BACKEND, ref: SESSION });
  await store.recordJobTransition(ISSUE, {
    to: 'building',
    at: '2026-08-09T18:00:00.000Z',
    by: 'system',
    reason: 'managed_test',
  });

  let versionNumber = 0;
  const putCandidateSources = vi.fn(async (input: { files: SourceFile[] }) => {
    versionNumber += 1;
    const version = `v-managed-${versionNumber}`;
    return { version, manifest: manifest(input.files, version) };
  });
  const gamesStore = { putCandidateSources } as unknown as GamesStore;
  const gate = vi.fn(async () => ({ buildId: 'build-managed-1' }));
  const service = createSourceDeliveryService({
    store,
    gamesStore,
    kitFileStore: opts?.kitFileStore,
    onSourcesDelivered: gate,
    onEvent: vi.fn(),
  });
  const authority: SourceDeliveryAuthority = {
    backend: BACKEND,
    sessionRef: SESSION,
    roundGeneration: 1,
  };
  return { store, putCandidateSources, gate, service, authority };
}

describe('shared source delivery', () => {
  it('accepts managed output and applies the common preview side effects', async () => {
    const { store, putCandidateSources, gate, service, authority } = await setup();

    const result = await service.deliver({
      issueNumber: ISSUE,
      slug: SLUG,
      files: PREVIEW_FILES,
      mode: 'preview',
      backend: BACKEND,
      authority,
    });

    expect(result).toMatchObject({
      accepted: true,
      slug: SLUG,
      version: 'v-managed-1',
      mode: 'preview',
      gateStarted: true,
      buildId: 'build-managed-1',
    });
    expect(putCandidateSources).toHaveBeenCalledWith(
      expect.objectContaining({ issueNumber: ISSUE, slug: SLUG, backend: BACKEND, mode: 'preview' }),
    );
    expect(gate).toHaveBeenCalledWith({ issueNumber: ISSUE, slug: SLUG, version: 'v-managed-1', mode: 'preview' });
    const record = await store.getSubmission(ISSUE);
    expect(record).toMatchObject({
      slug: SLUG,
      previewVersion: 'v-managed-1',
      title: 'Managed Comet',
    });
    expect(record?.deliveredVersion).toBeUndefined();
  });

  it('uses the same service for publish side effects and transition', async () => {
    const { store, service, authority } = await setup();

    const result = await service.deliver({
      issueNumber: ISSUE,
      slug: SLUG,
      files: PUBLISH_FILES,
      mode: 'publish',
      backend: BACKEND,
      authority,
    });

    expect(result).toMatchObject({ accepted: true, mode: 'publish' });
    expect((await store.getSubmission(ISSUE)) ?? {}).toMatchObject({
      deliveredVersion: 'v-managed-1',
      previewVersion: 'v-managed-1',
      state: 'submitted',
    });
  });

  it.each([
    ['backend', { backend: 'managed:other' }],
    ['session', { sessionRef: 'session-old' }],
    ['generation', { roundGeneration: 2 }],
  ])('rejects managed output with a wrong %s authority before storing', async (_label, change) => {
    const { putCandidateSources, service, authority } = await setup();

    await expect(
      service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files: PREVIEW_FILES,
        mode: 'preview',
        backend: BACKEND,
        authority: { ...authority, ...change },
      }),
    ).rejects.toBeInstanceOf(SourceDeliveryAuthorityError);
    expect(putCandidateSources).not.toHaveBeenCalled();
  });

  it('re-reads the record and rejects a stale session after the round generation advances', async () => {
    const { putCandidateSources, service, authority, store } = await setup();
    await store.bumpRoundGeneration(ISSUE);

    await expect(
      service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files: PREVIEW_FILES,
        mode: 'preview',
        backend: BACKEND,
        authority,
      }),
    ).rejects.toMatchObject({ reason: 'round_generation_mismatch' });
    expect(putCandidateSources).not.toHaveBeenCalled();
  });

  it('rejects a cancelled round even when the caller presents its new generation', async () => {
    const { putCandidateSources, service, authority, store } = await setup();
    await store.recordJobTransition(ISSUE, {
      to: 'canceled',
      at: '2026-08-09T18:01:00.000Z',
      by: 'operator',
      reason: 'managed_test_cancel',
    });

    await expect(
      service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files: PREVIEW_FILES,
        mode: 'preview',
        backend: BACKEND,
        authority: { ...authority, roundGeneration: 2 },
      }),
    ).rejects.toMatchObject({ reason: 'round_closed' });
    expect(putCandidateSources).not.toHaveBeenCalled();
  });

  describe('typecheck preflight', () => {
    const PINNED = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const CURRENT = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const brokenFiles: SourceFile[] = [
      { path: 'SPEC.md', content: '---\ntitle: Broken\n---\n' },
      { path: 'index.html', content: '<!doctype html>' },
      {
        path: 'game/model.ts',
        content: 'export type Round = { score: number };\n',
      },
      {
        path: 'game.ts',
        content: `
import type { Round } from './game/model.ts';
export function tick(round: Round) {
  return round.lane + round.speed;
}
`,
      },
    ];

    it('refuses a typed Round-field failure before storing', async () => {
      const kitFileStore = fakeKitStore({ [PINNED]: treeFor(PINNED, KIT_DTS) });
      const { store, putCandidateSources, service, authority } = await setup({ kitFileStore });
      await store.pinRoundKitEngineRef(ISSUE, PINNED);

      await expect(
        service.deliver({
          issueNumber: ISSUE,
          slug: SLUG,
          files: brokenFiles,
          mode: 'preview',
          backend: BACKEND,
          authority,
        }),
      ).rejects.toBeInstanceOf(InvalidUploadError);
      expect(putCandidateSources).not.toHaveBeenCalled();
      expect((await store.getSubmission(ISSUE))?.roundTypecheckPreflightRefusals).toBe(1);
    });

    it('loads the pinned kit even after the registry pointer moves', async () => {
      let loaded: string | undefined;
      const kitFileStore: KitFileStore = {
        loadRegistry: async () => ({ engineRef: CURRENT, previous: PINNED, sha256: 'a'.repeat(64) }),
        loadTree: async (engineRef?: string) => {
          loaded = engineRef ?? CURRENT;
          // Empty current kit would skip if pin ignored.
          if (loaded === PINNED) return treeFor(PINNED, KIT_DTS);
          return treeFor(CURRENT, '');
        },
        loadCurrentTree: async () => treeFor(CURRENT, ''),
      };
      const { store, putCandidateSources, service, authority } = await setup({ kitFileStore });
      await store.pinRoundKitEngineRef(ISSUE, PINNED);

      await expect(
        service.deliver({
          issueNumber: ISSUE,
          slug: SLUG,
          files: brokenFiles,
          mode: 'preview',
          backend: BACKEND,
          authority,
        }),
      ).rejects.toThrow(/Typecheck preflight failed/);
      expect(loaded).toBe(PINNED);
      expect(putCandidateSources).not.toHaveBeenCalled();
    });

    it('accepts on the third submit and attaches diagnostics to the round', async () => {
      const kitFileStore = fakeKitStore({ [PINNED]: treeFor(PINNED, KIT_DTS) });
      const { store, putCandidateSources, service, authority } = await setup({ kitFileStore });
      await store.pinRoundKitEngineRef(ISSUE, PINNED);

      for (let i = 0; i < 2; i += 1) {
        await expect(
          service.deliver({
            issueNumber: ISSUE,
            slug: SLUG,
            files: brokenFiles,
            mode: 'preview',
            backend: BACKEND,
            authority,
          }),
        ).rejects.toBeInstanceOf(InvalidUploadError);
      }
      expect(putCandidateSources).not.toHaveBeenCalled();

      const result = await service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files: brokenFiles,
        mode: 'preview',
        backend: BACKEND,
        authority,
      });
      expect(result.accepted).toBe(true);
      expect(putCandidateSources).toHaveBeenCalledOnce();
      const record = await store.getSubmission(ISSUE);
      expect(record?.roundTypecheckPreflightRefusals).toBe(2);
      expect(record?.roundTypecheckPreflightBypassErrors).toMatch(/Typecheck preflight failed/);
    });

    it('does not refuse when no kit store is configured', async () => {
      const { putCandidateSources, service, authority } = await setup({ kitFileStore: null });
      const result = await service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files: brokenFiles,
        mode: 'preview',
        backend: BACKEND,
        authority,
      });
      expect(result.accepted).toBe(true);
      expect(putCandidateSources).toHaveBeenCalledOnce();
    });
  });
});
