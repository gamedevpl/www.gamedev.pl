import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { CAPTURE_NOTICE, captureNoticeFor } from './capture-notice.js';
import { channelControlFields } from './mcp-tool-support.js';

const record = { slug: 'neon', previewVersion: 'v2' };
const files = (sources: Record<string, string>) => ({
  getSourceFile: async (_slug: string, _version: string, path: string) => sources[path] ?? null,
});

describe('captureNoticeFor', () => {
  it('tells the builder to write a capture plan once the owner asked for sketches', async () => {
    const store = new InMemoryStore();
    await store.setGameDreamsWantedAt('neon', '2026-10-18T10:00:00.000Z');
    expect(await captureNoticeFor(store, files({}), record)).toEqual({ captureNotice: CAPTURE_NOTICE });
    // Before any delivery the plan is still owed.
    expect(await captureNoticeFor(store, files({}), { slug: 'neon' })).toEqual({ captureNotice: CAPTURE_NOTICE });
  });

  it('goes quiet when the plan exists, or nobody asked', async () => {
    const store = new InMemoryStore();
    expect(await captureNoticeFor(store, files({}), record)).toEqual({});
    await store.setGameDreamsWantedAt('neon', '2026-10-18T10:00:00.000Z');
    expect(await captureNoticeFor(store, files({ 'CAPTURE.json': '{}' }), record)).toEqual({});
  });

  it('never fails a round start on a read error', async () => {
    const store = new InMemoryStore();
    store.getGameDreamsWantedAt = async () => {
      throw new Error('blip');
    };
    expect(await captureNoticeFor(store, files({}), record)).toEqual({});
  });
});

describe('capture_plan_missing', () => {
  it('turns the channel flag into a soft warning, and stays silent without it', () => {
    const warned = channelControlFields({ captureMissing: true });
    expect(warned.warnings?.map((warning) => warning.code)).toEqual(['capture_plan_missing']);
    expect(warned.warnings?.[0]?.message).toContain('CAPTURE.json');
    expect(warned.stop).toBe(false);
    expect(channelControlFields({}).warnings).toBeUndefined();
  });
});
