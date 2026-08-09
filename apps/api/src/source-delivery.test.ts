import { describe, expect, it, vi } from 'vitest';
import type { GamesStore, SourceFile, VersionManifest } from './games-store.js';
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

async function setup() {
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
    expect((await store.getSubmission(ISSUE)) ?? {}).toMatchObject({
      slug: SLUG,
      previewVersion: 'v-managed-1',
      deliveredVersion: undefined,
      title: 'Managed Comet',
    });
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
});
