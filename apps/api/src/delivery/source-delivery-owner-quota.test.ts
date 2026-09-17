// The gate-run ceiling names a person: the right one.

import { describe, expect, it, vi } from 'vitest';
import type { GamesStore, SourceFile, VersionManifest } from './games-store.js';
import { InMemoryStore } from '../platform/store.js';
import { createSourceDeliveryService } from './source-delivery.js';
import { parseSpecTitle } from '../catalog/github-client.js';
import {
  runTypecheckPreflight,
  sharedSourcesFromKitTree,
  TYPECHECK_PREFLIGHT_MAX_REFUSALS,
} from '../creation/typecheck-preflight.js';

const JOB = 941;
const SLUG = 'sky-dodge-quota';

const FILES: SourceFile[] = [
  { path: 'SPEC.md', content: '---\ntitle: Sky Dodge\n---\nSteer the glider home.' },
  { path: 'GAME.json', content: JSON.stringify({ title: { en: 'Sky Dodge', pl: 'Lot' } }) },
  { path: 'game.ts', content: 'export {};' },
];

async function handedOverJob(store: InMemoryStore): Promise<void> {
  const at = new Date().toISOString();
  await store.upsertUser({ uid: 'g:ada' });
  await store.upsertUser({ uid: 'g:grace' });
  await store.createSubmission(JOB, 'g:ada', 'Sky Dodge');
  await store.setSubmissionSlug(JOB, SLUG);
  await store.ensureGameAccess(SLUG, 'g:ada', at, at);

  const later = new Date(Date.now() + 1000).toISOString();
  const code = (await store.ensureRecipientCode('g:grace', later))!;
  const revision = (await store.getGameAccess(SLUG))!.accessRevision;
  await store.createGameTransferInvitation(SLUG, 'g:ada', 'g:grace', revision, later, code);
  const invite = (await store.getActiveGameTransfer(SLUG, later))!;
  await store.acceptGameTransferInvitation(SLUG, 'g:grace', later, invite.invitationId);

  // Only now is there a round to deliver into.
  await store.recordJobTransition(JOB, { to: 'building', at: later, by: 'system', reason: 'test' });
}

describe('the gate-run ceiling on a transferred game', () => {
  it('reads the headroom of the creator who owns the game now', async () => {
    const store = new InMemoryStore();
    await handedOverJob(store);
    expect((await store.getGameAccess(SLUG))?.ownerUid).toBe('g:grace');
    const peek = vi.fn(async () => ({ allowed: true }));

    const gamesStore = {
      putCandidateSources: vi.fn(async (input: { files: SourceFile[] }) => ({
        version: 'v-1',
        manifest: { version: 'v-1', jobId: JOB, sourceFiles: input.files.map((file) => file.path) } as VersionManifest,
      })),
      putDerivedArtifact: vi.fn(async () => {}),
    } as unknown as GamesStore;

    const service = createSourceDeliveryService({
      store,
      gamesStore,
      onSourcesDelivered: vi.fn(async () => ({ buildId: 'b1' })),
      onEvent: vi.fn(),
      log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      parseSpecTitle,
      runTypecheckPreflight,
      sharedSourcesFromKitTree,
      typecheckPreflightMaxRefusals: TYPECHECK_PREFLIGHT_MAX_REFUSALS,
      gateRunGate: { peek },
    });

    const outcome = await service.deliver({
      jobId: JOB,
      slug: SLUG,
      files: FILES,
      mode: 'preview',
      actorUid: 'g:grace',
    });
    expect(outcome).toMatchObject({ accepted: true });

    expect(peek).toHaveBeenCalledTimes(1);
    expect(peek.mock.calls[0]![0]).toBe('g:grace');
  });
});
