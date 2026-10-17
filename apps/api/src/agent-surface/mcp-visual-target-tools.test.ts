import { describe, expect, it, vi } from 'vitest';
import type { GamesStore } from '../delivery/games-store.js';
import { VISUAL_TARGET_SHOT_LABEL } from '../platform/dream-shots.js';
import { InMemoryStore, type SubmissionRecord } from '../platform/store.js';
import { createVisualTargetTools, type VisualTargetToolsDeps } from './mcp-visual-target-tools.js';
import { verifyReferenceImageToken } from './reference-image-url.js';
import { pngOf } from '../platform/image-size.test.js';
import type { ToolContext } from './mcp-tool-support.js';

// A 4x2 PNG header is all imageSize and isPng read.
function png(width = 4, height = 2): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

const JOB = 7;
const FRAME = pngOf(4, 2).toString('base64');
const CTX = { bearerToken: 'opener' } as unknown as ToolContext;
const RECORD = { slug: 'rocks', title: 'Rocks', previewVersion: 'v1', roundGeneration: 1 } as SubmissionRecord;
const OPENER = { jobId: JOB, roundGeneration: 1, exp: Date.parse('2026-10-18T00:00:00Z') / 1000 };

async function setup(overrides: Partial<VisualTargetToolsDeps> = {}) {
  const store = new InMemoryStore();
  await store.createSubmission(JOB, 'g:owner', 'Rocks');
  const recordJobCost = vi.spyOn(store, 'recordJobCost');
  const frames = {
    model: 'img-model',
    generate: vi.fn(async () => ({ data: FRAME, mediaType: 'image/png' as const })),
  };
  const gamesStore = {
    getManifest: async () => ({ previewGate: { green: true, screenshot: 'media/shot.png' } }),
    getDerivedArtifact: async () => png(),
  } as unknown as GamesStore;
  const deps: VisualTargetToolsDeps = {
    resolveAuth: async () => ({ jobId: JOB, record: RECORD, claims: { roundGeneration: 1 } }),
    managedOpener: () => OPENER,
    store,
    gamesStore,
    frames,
    availability: { dreamingEnabled: async () => true, spendFrameSlots: async () => true },
    agentTokenSecret: 'secret',
    now: () => Date.parse('2026-10-17T00:00:00Z'),
    ...overrides,
  };
  const call = (args: Record<string, unknown>) => createVisualTargetTools(deps).visual_target!.handler(args, CTX);
  return { store, frames, recordJobCost, call };
}

describe('visual_target', () => {
  it('draws on the green gate frame and returns a signed URL, never bytes', async () => {
    const { store, frames, recordJobCost, call } = await setup();
    const result = await call({ direction: 'warmer torches on the side walls' });
    expect(result.isError).toBeUndefined();
    const out = result.structuredContent as { url: string; remaining: number };
    expect(out.remaining).toBe(1);
    expect(JSON.stringify(result)).not.toContain(FRAME);
    expect(frames.generate).toHaveBeenCalledWith(
      expect.objectContaining({ width: 4, height: 2, direction: 'warmer torches on the side walls' }),
    );
    expect(recordJobCost).toHaveBeenCalledWith(JOB, expect.objectContaining({ kind: 'concept', by: 'img-model' }));
    const token = new URL(out.url).searchParams.get('t')!;
    const claim = verifyReferenceImageToken('secret', token, Date.parse('2026-10-17T00:00:00Z'));
    const shot = await store.getBuildShot(JOB, claim!.shotId);
    expect(shot).toMatchObject({ label: VISUAL_TARGET_SHOT_LABEL, roundGeneration: 1, platformDrawn: true });
  });

  it('refuses an opener that does not name this job, round or builder', async () => {
    const refused = [
      { managedOpener: () => null },
      { managedOpener: () => ({ ...OPENER, jobId: JOB + 1 }) },
      { managedOpener: () => ({ ...OPENER, roundGeneration: 0 }) },
      { managedOpener: () => ({ ...OPENER, exp: 1 }) },
      { resolveAuth: async () => ({ jobId: JOB, record: { ...RECORD, roundGeneration: 2 }, claims: {} }) },
      { resolveAuth: async () => ({ jobId: JOB, record: { ...RECORD, builder: 'self' as const }, claims: {} }) },
    ] satisfies Array<Partial<VisualTargetToolsDeps>>;
    for (const overrides of refused) {
      const { frames, call } = await setup(overrides);
      expect((await call({ direction: 'x' })).structuredContent).toMatchObject({ code: 'not_owner' });
      expect(frames.generate).not.toHaveBeenCalled();
    }
  });

  it('stops after the per-round allowance and when unconfigured or switched off', async () => {
    const { call } = await setup();
    await call({ direction: 'a' });
    await call({ direction: 'b' });
    expect((await call({ direction: 'c' })).structuredContent).toMatchObject({ code: 'quota_exhausted' });
    expect((await (await setup({ frames: null })).call({ direction: 'a' })).structuredContent).toMatchObject({
      code: 'feature_unavailable',
    });
    const off = await setup({
      availability: { dreamingEnabled: async () => false, spendFrameSlots: async () => true },
    });
    expect((await off.call({ direction: 'a' })).structuredContent).toMatchObject({ code: 'feature_unavailable' });
  });

  it('stores nothing when the model returns bytes that are not a usable image', async () => {
    const broken = { model: 'img-model', generate: async () => ({ data: 'AAAA', mediaType: 'image/png' as const }) };
    const { store, call } = await setup({ frames: broken });
    expect((await call({ direction: 'x' })).isError).toBe(true);
    expect(await store.listBuildShots(JOB, { label: VISUAL_TARGET_SHOT_LABEL })).toHaveLength(0);
  });

  it('counts failed generations against the round, before any spend', async () => {
    const failing = { model: 'img-model', generate: async () => Promise.reject(new Error('429')) };
    const spend = vi.fn(async () => true);
    const { call } = await setup({
      frames: failing,
      availability: { dreamingEnabled: async () => true, spendFrameSlots: spend },
    });
    await call({ direction: 'a' });
    await call({ direction: 'b' });
    expect((await call({ direction: 'c' })).structuredContent).toMatchObject({ code: 'quota_exhausted' });
    expect(spend).toHaveBeenCalledTimes(2);
  });

  it('rejects a frame whose shape no longer matches the gate frame', async () => {
    const square = {
      model: 'img-model',
      generate: async () => ({ data: pngOf(4, 4).toString('base64'), mediaType: 'image/png' as const }),
    };
    const { store, call } = await setup({ frames: square });
    expect((await call({ direction: 'x' })).isError).toBe(true);
    expect(await store.listBuildShots(JOB, { label: VISUAL_TARGET_SHOT_LABEL })).toHaveLength(0);
  });

  it('says so when there is no green gate frame to draw on', async () => {
    const gamesStore = { getManifest: async () => ({}), getDerivedArtifact: async () => null };
    const { frames, call } = await setup({ gamesStore: gamesStore as unknown as GamesStore });
    expect((await call({ direction: 'x' })).isError).toBe(true);
    expect(frames.generate).not.toHaveBeenCalled();
  });
});
