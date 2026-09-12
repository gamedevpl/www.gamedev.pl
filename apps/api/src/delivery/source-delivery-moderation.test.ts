// Moderating the artifact, because this lane had no prompt.

import { describe, expect, it, vi } from 'vitest';
import type { GamesStore, SourceFile, VersionManifest } from './games-store.js';
import { InMemoryStore } from '../platform/store.js';
import type { ContentChecker, ModerationVerdict } from '../platform/moderation.js';
import { createSourceDeliveryService, type SourceDeliveryAuthority } from './source-delivery.js';
import { MAX_MANIFEST_CHARS, MAX_SPEC_CHARS } from './delivered-prose.js';
import { parseSpecTitle } from '../catalog/github-client.js';
import {
  runTypecheckPreflight,
  sharedSourcesFromKitTree,
  TYPECHECK_PREFLIGHT_MAX_REFUSALS,
} from '../creation/typecheck-preflight.js';

const ISSUE = 909;
const SLUG = 'prose-comet';
const BACKEND = 'managed:fake';

const authority: SourceDeliveryAuthority = { backend: BACKEND, sessionRef: 'session-909', roundGeneration: 1 };

const FILES: SourceFile[] = [
  { path: 'SPEC.md', content: '---\ntitle: Prose Comet\n---\nSteer the comet home.' },
  { path: 'GAME.json', content: JSON.stringify({ title: { en: 'Comet', pl: 'Kometa' } }) },
  { path: 'game.ts', content: 'export {};' },
];

function checker(verdict: ModerationVerdict) {
  const checkFields = vi.fn(async () => verdict);
  return { checkFields, check: vi.fn(async () => verdict) } as unknown as ContentChecker & {
    checkFields: ReturnType<typeof vi.fn>;
  };
}

async function setup(opts: {
  contentChecker: ContentChecker;
  gateRunGate?: { peek(uid: string, dateStr: string): Promise<{ allowed: boolean }> };
}) {
  const store = new InMemoryStore();
  await store.createSubmission(ISSUE, 'owner', 'Original title');
  await store.setSubmissionSlug(ISSUE, SLUG);
  await store.recordDispatch(ISSUE, { backend: BACKEND, ref: 'session-909' });
  await store.recordJobTransition(ISSUE, {
    to: 'building',
    at: new Date().toISOString(),
    by: 'system',
    reason: 'managed_test',
  });

  const putCandidateSources = vi.fn(async (input: { files: SourceFile[] }) => ({
    version: 'v-1',
    manifest: { version: 'v-1', jobId: ISSUE, sourceFiles: input.files.map((f) => f.path) } as VersionManifest,
  }));
  const gamesStore = { putCandidateSources, putDerivedArtifact: vi.fn(async () => {}) } as unknown as GamesStore;
  const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

  const service = createSourceDeliveryService({
    store,
    gamesStore,
    onSourcesDelivered: vi.fn(async () => ({ buildId: 'b1' })),
    onEvent: vi.fn(),
    log,
    parseSpecTitle,
    runTypecheckPreflight,
    sharedSourcesFromKitTree,
    typecheckPreflightMaxRefusals: TYPECHECK_PREFLIGHT_MAX_REFUSALS,
    contentChecker: opts.contentChecker,
    ...(opts.gateRunGate ? { gateRunGate: opts.gateRunGate } : {}),
  });
  return { service, putCandidateSources, log };
}

function deliver(service: Awaited<ReturnType<typeof setup>>['service'], files = FILES) {
  return service.deliver({ jobId: ISSUE, slug: SLUG, files, mode: 'preview', backend: BACKEND, authority });
}

describe('delivered prose moderation', () => {
  it('refuses a delivery whose prose is rejected, and never stores it', async () => {
    const contentChecker = checker({ allowed: false, category: 'violence' });
    const { service, putCandidateSources, log } = await setup({ contentChecker });

    const result = await deliver(service);

    expect(result).toMatchObject({ accepted: false, rejected: 'content_rejected', category: 'violence' });
    expect(putCandidateSources).not.toHaveBeenCalled();
    // Counted, so a dead deny-list looks different from a quiet one.
    expect(log.warn).toHaveBeenCalledWith(
      { moderation: { surface: 'delivery', category: 'violence', uid: 'owner' } },
      'moderation rejected',
    );
  });

  it('separates an outage from a rejection so the creator knows to retry', async () => {
    const contentChecker = checker({ allowed: false, category: 'other', unavailable: true });
    const { service, putCandidateSources, log } = await setup({ contentChecker });

    const result = await deliver(service);

    expect(result).toMatchObject({ accepted: false, rejected: 'moderation_unavailable' });
    expect(putCandidateSources).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(expect.anything(), 'moderation unavailable');
  });

  it('sends prose to the checker and nothing else', async () => {
    const contentChecker = checker({ allowed: true });
    const { service } = await setup({ contentChecker });

    await deliver(service, [
      { path: 'SPEC.md', content: '---\ntitle: Prose Comet\n---\nSteer the comet home.' },
      {
        path: 'GAME.json',
        content: JSON.stringify({
          title: { en: 'Comet', pl: 'Kometa' },
          howToPlay: { goal: { en: 'Get home', pl: 'Wróć' }, hint: { en: 'Use arrows', pl: 'Strzałki' } },
          audio: { music: 'drift-theme' },
          canvas: { width: 640, height: 400 },
        }),
      },
      { path: 'game.ts', content: 'export const SECRET_TOKEN = "not prose";' },
    ]);

    const fields = contentChecker.checkFields.mock.calls[0]![0] as string[];
    expect(fields.some((field) => field.includes('Steer the comet home.'))).toBe(true);
    expect(fields).toContain('Get home');
    // Code, track names and canvas numbers are not text a player reads.
    expect(fields.join('\n')).not.toContain('SECRET_TOKEN');
    expect(fields).not.toContain('drift-theme');
  });

  it('budgets what one batched call carries', async () => {
    // checkFields joins fields into one prompt; the total is the cost.
    const contentChecker = checker({ allowed: true });
    const { service } = await setup({ contentChecker });

    await deliver(service, [
      { path: 'SPEC.md', content: 'x'.repeat(50_000) },
      {
        path: 'GAME.json',
        content: JSON.stringify({
          title: { en: 'y'.repeat(5_000), pl: 'z'.repeat(5_000) },
          description: { en: 'w'.repeat(5_000), pl: 'v'.repeat(5_000) },
        }),
      },
      { path: 'game.ts', content: 'export {};' },
    ]);

    const fields = contentChecker.checkFields.mock.calls[0]![0] as string[];
    const total = fields.join('').length;
    expect(total).toBeLessThanOrEqual(MAX_SPEC_CHARS + MAX_MANIFEST_CHARS);
  });

  it('asks once for prose that has not changed, and again when it has', async () => {
    // Code-only iteration is the common case; it costs no calls.
    const contentChecker = checker({ allowed: true });
    const { service } = await setup({ contentChecker });

    await deliver(service);
    await deliver(service, [...FILES, { path: 'style.css', content: 'body{}' }]);
    expect(contentChecker.checkFields).toHaveBeenCalledTimes(1);

    await deliver(service, [
      { path: 'SPEC.md', content: '---\ntitle: Prose Comet\n---\nNow it is about something else.' },
      { path: 'GAME.json', content: JSON.stringify({ title: { en: 'Comet', pl: 'Kometa' } }) },
      { path: 'game.ts', content: 'export {};' },
    ]);
    expect(contentChecker.checkFields).toHaveBeenCalledTimes(2);
  });

  it('never caches a refusal into a pass', async () => {
    const contentChecker = checker({ allowed: false, category: 'hate' });
    const { service } = await setup({ contentChecker });

    expect(await deliver(service)).toMatchObject({ rejected: 'content_rejected' });
    expect(await deliver(service)).toMatchObject({ rejected: 'content_rejected' });
    expect(contentChecker.checkFields).toHaveBeenCalledTimes(2);
  });

  it('costs nothing when a cap already refused the delivery', async () => {
    // R12: twelve routes pay for moderation before their quota. Not this one.
    const contentChecker = checker({ allowed: true });
    const { service } = await setup({ contentChecker, gateRunGate: { peek: async () => ({ allowed: false }) } });

    const result = await deliver(service);

    expect(result).toMatchObject({ accepted: false, rejected: 'gate_capacity' });
    expect(contentChecker.checkFields).not.toHaveBeenCalled();
  });
});
