import { describe, expect, it, vi } from 'vitest';
import type { GamesStore, SourceFile, VersionManifest } from './games-store.js';
import { InvalidUploadError } from './games-store.js';
import type { KitFileStore, KitTree } from '../agent-surface/kit-files.js';
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';
import { InMemoryStore } from '../platform/store.js';
import { NoopTranslator, type BilingualText, type Translator } from '../platform/translate.js';
import { DELIVERY_ACCEPTED_MSG, DELIVERY_PREFLIGHT_REFUSED_MSG } from '../platform/delivery-metrics.js';
import {
  createSourceDeliveryService,
  SourceDeliveryAuthorityError,
  type SourceDeliveryAuthority,
} from './source-delivery.js';
import type { StagedPreviewPublisher } from './staged-preview.js';

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

function stubTranslator(pl: string): Translator {
  return { toBilingual: async (text): Promise<BilingualText> => ({ en: text, localized: pl }) };
}

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

async function setup(opts?: {
  kitFileStore?: KitFileStore | null;
  failPutCandidateSources?: boolean;
  translator?: Translator;
  stagedPreviews?: Pick<StagedPreviewPublisher, 'publishCandidate'>;
}) {
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
    if (opts?.failPutCandidateSources) throw new InvalidUploadError('storage rejected this delivery', 'audio');
    versionNumber += 1;
    const version = `v-managed-${versionNumber}`;
    return { version, manifest: manifest(input.files, version) };
  });
  const putDerivedArtifact = vi.fn(async () => {});
  const gamesStore = { putCandidateSources, putDerivedArtifact } as unknown as GamesStore;
  const gate = vi.fn(async () => ({ buildId: 'build-managed-1' }));
  const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const service = createSourceDeliveryService({
    store,
    gamesStore,
    kitFileStore: opts?.kitFileStore,
    stagedPreviews: opts?.stagedPreviews,
    onSourcesDelivered: gate,
    onEvent: vi.fn(),
    log,
    translator: opts?.translator ?? new NoopTranslator(),
  });
  const authority: SourceDeliveryAuthority = {
    backend: BACKEND,
    sessionRef: SESSION,
    roundGeneration: 1,
  };
  return { store, putCandidateSources, putDerivedArtifact, gate, service, authority, log };
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
      expect.objectContaining({
        issueNumber: ISSUE,
        roundGeneration: 1,
        slug: SLUG,
        backend: BACKEND,
        mode: 'preview',
        requireCompiledEditor: true,
      }),
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
    const { store, putCandidateSources, service, authority } = await setup();
    await store.createSubmission(700, 'owner', 'Published catalog game');
    await store.setSubmissionSlug(700, SLUG);
    await store.setSubmissionPublishedAt(700, '2026-08-01T00:00:00.000Z');

    const result = await service.deliver({
      issueNumber: ISSUE,
      slug: SLUG,
      files: PUBLISH_FILES,
      mode: 'publish',
      backend: BACKEND,
      authority,
    });

    expect(result).toMatchObject({ accepted: true, mode: 'publish' });
    expect(putCandidateSources).toHaveBeenCalledWith(expect.objectContaining({ requireCompiledEditor: false }));
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
      const { store, putCandidateSources, service, authority, log } = await setup({ kitFileStore });
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
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          delivery: expect.objectContaining({ kind: 'typecheck', attempt: 1 }),
        }),
        DELIVERY_PREFLIGHT_REFUSED_MSG,
      );
    });

    it('logs an accepted delivery with submitAttempts and refusals', async () => {
      const { store, service, authority, log } = await setup();
      await service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files: PREVIEW_FILES,
        mode: 'preview',
        backend: BACKEND,
        authority,
      });
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          delivery: expect.objectContaining({
            submitAttempts: 1,
            refusals: { audio: 0, symbols: 0, typecheck: 0 },
          }),
        }),
        DELIVERY_ACCEPTED_MSG,
      );
      expect((await store.getSubmission(ISSUE))?.roundSubmitAttempts).toBe(1);
    });

    it('loads the pinned kit even after the registry pointer moves', async () => {
      let loaded: string | undefined;
      const kitFileStore: KitFileStore = {
        loadRegistry: async () => ({ engineRef: CURRENT, previous: PINNED, sha256: 'a'.repeat(64) }),
        loadTree: async (engineRef?: string) => {
          loaded = engineRef ?? CURRENT;
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
      const { store, putCandidateSources, service, authority, log } = await setup({ kitFileStore });
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
      expect(log.warn.mock.calls[0]?.[0]).toMatchObject({ message: record?.roundTypecheckPreflightBypassErrors });
      const events = await store.listBuildEvents(ISSUE);
      expect(events).toContainEqual(
        expect.objectContaining({ kind: 'blocked', text: expect.stringContaining('without a passing typecheck') }),
      );
    });

    it('does not post the bypass warning when the delivery itself fails to store', async () => {
      const kitFileStore = fakeKitStore({ [PINNED]: treeFor(PINNED, KIT_DTS) });
      const { store, service, authority } = await setup({ kitFileStore, failPutCandidateSources: true });
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

      expect(await store.listBuildEvents(ISSUE)).toEqual([]);
    });

    it('localizes the bypass warning like any other build event', async () => {
      const kitFileStore = fakeKitStore({ [PINNED]: treeFor(PINNED, KIT_DTS) });
      const { store, service, authority } = await setup({
        kitFileStore,
        translator: stubTranslator('Dostarczono bez przejścia typecheck.'),
      });
      await store.pinRoundKitEngineRef(ISSUE, PINNED);

      for (let i = 0; i < 3; i += 1) {
        await service
          .deliver({ issueNumber: ISSUE, slug: SLUG, files: brokenFiles, mode: 'preview', backend: BACKEND, authority })
          .catch(() => {});
      }

      const events = await store.listBuildEvents(ISSUE);
      expect(events).toContainEqual(
        expect.objectContaining({
          kind: 'blocked',
          textLocalized: 'Dostarczono bez przejścia typecheck.',
          locale: 'pl',
        }),
      );
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

    it('clears bypass diagnostics after a later clean delivery', async () => {
      const kitFileStore = fakeKitStore({ [PINNED]: treeFor(PINNED, KIT_DTS) });
      const { store, service, authority } = await setup({ kitFileStore });
      await store.pinRoundKitEngineRef(ISSUE, PINNED);
      await store.setRoundTypecheckPreflightBypassErrors(ISSUE, 'stale diagnostics');

      const clean: SourceFile[] = [
        { path: 'SPEC.md', content: '---\ntitle: Clean\n---\n' },
        { path: 'index.html', content: '<!doctype html>' },
        { path: 'game.ts', content: 'export const n = 1;\n' },
      ];
      const result = await service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files: clean,
        mode: 'preview',
        backend: BACKEND,
        authority,
      });
      expect(result.accepted).toBe(true);
      expect((await store.getSubmission(ISSUE))?.roundTypecheckPreflightBypassErrors).toBeUndefined();

      const events = await store.listBuildEvents(ISSUE);
      expect(events).toContainEqual(
        expect.objectContaining({ kind: 'milestone', text: expect.stringContaining('no longer applies') }),
      );
    });

    it('does not resolve the bypass when the check only skipped, not passed', async () => {
      const emptyKit = { engineRef: PINNED, sha256: 'a'.repeat(64), files: new Map() };
      const kitFileStore = fakeKitStore({ [PINNED]: emptyKit });
      const { store, service, authority } = await setup({ kitFileStore });
      await store.pinRoundKitEngineRef(ISSUE, PINNED);
      await store.setRoundTypecheckPreflightBypassErrors(ISSUE, 'stale diagnostics');

      const clean: SourceFile[] = [
        { path: 'SPEC.md', content: '---\ntitle: Clean\n---\n' },
        { path: 'index.html', content: '<!doctype html>' },
        { path: 'game.ts', content: 'export const n = 1;\n' },
      ];
      const result = await service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files: clean,
        mode: 'preview',
        backend: BACKEND,
        authority,
      });
      expect(result.accepted).toBe(true);
      expect((await store.getSubmission(ISSUE))?.roundTypecheckPreflightBypassErrors).toBe('stale diagnostics');
      expect(await store.listBuildEvents(ISSUE)).toEqual([]);
    });

    it('does not let a thread-event write failure roll back an accepted delivery', async () => {
      const kitFileStore = fakeKitStore({ [PINNED]: treeFor(PINNED, KIT_DTS) });
      const { store, service, authority } = await setup({ kitFileStore });
      await store.pinRoundKitEngineRef(ISSUE, PINNED);
      store.appendBuildEvent = vi.fn(async () => {
        throw new Error('event store unavailable');
      });

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

      const result = await service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files: brokenFiles,
        mode: 'preview',
        backend: BACKEND,
        authority,
      });
      expect(result.accepted).toBe(true);
      expect((await store.getSubmission(ISSUE))?.previewVersion).toBeDefined();
    });

    it('does not relock a creator manual delivery as a resumed agent round', async () => {
      const kitFileStore = fakeKitStore({ [PINNED]: treeFor(PINNED, KIT_DTS) });
      const { store, service } = await setup({ kitFileStore });
      await store.pinRoundKitEngineRef(ISSUE, PINNED);
      await store.markAgentEnded(ISSUE, '2026-08-19T07:00:00.000Z', 'end');

      for (let i = 0; i < 2; i += 1) {
        await expect(
          service.deliver({
            issueNumber: ISSUE,
            slug: SLUG,
            files: brokenFiles,
            mode: 'preview',
            actor: 'creator',
          }),
        ).rejects.toBeInstanceOf(InvalidUploadError);
      }
      const result = await service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files: brokenFiles,
        mode: 'preview',
        actor: 'creator',
      });
      expect(result.accepted).toBe(true);
      expect((await store.getSubmission(ISSUE))?.agentEndedAt).toBe('2026-08-19T07:00:00.000Z');
    });

    it('calls stagedPreviews.publishCandidate on candidate delivery when stagedPreviews is provided', async () => {
      const stagedPreviews = {
        publishCandidate: vi.fn(async () => 'published' as const),
      };
      const { service, authority } = await setup({ stagedPreviews });

      const files: SourceFile[] = [
        { path: 'GAME.json', content: JSON.stringify({ title: 'Fast Game', theme: { bg: '#000' } }) },
        { path: 'game.ts', content: 'export function start() {}' },
        { path: 'index.html', content: '<!doctype html><html><body></body></html>' },
        { path: 'SPEC.md', content: '---\ntitle: Fast Game\n---\n# Fast Game' },
      ];

      const result = await service.deliver({
        issueNumber: ISSUE,
        slug: SLUG,
        files,
        mode: 'publish',
        backend: BACKEND,
        authority,
      });

      expect(result.accepted).toBe(true);
      expect(stagedPreviews.publishCandidate).toHaveBeenCalledWith({
        issueNumber: ISSUE,
        slug: SLUG,
        version: expect.any(String),
        roundGeneration: 1,
        files,
        kitEngineRef: undefined,
        locale: undefined,
      });
    });
  });
});
