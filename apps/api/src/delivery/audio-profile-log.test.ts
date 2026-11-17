import { describe, expect, it } from 'vitest';
import type { KitFileStore } from '../agent-surface/kit-files.js';
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';
import { DELIVERY_AUDIO_PROFILE_MSG, withAudioProfileLog } from './audio-profile-log.js';
import { computeStageAdvisories } from './stage-hints.js';
import type { SourceDeliveryInput, SourceDeliveryOutcome, SourceDeliveryService } from './source-delivery.js';

const AUDIO = { sounds: ['ui-toggle', 'win', 'lose'], music: 'carnival-spin' };
const files = new Map(
  Object.entries({
    'shared/audio/music.json': JSON.stringify({ tracks: { 'carnival-spin': {} } }),
    'starters/arena-tag/GAME.json': JSON.stringify({ audio: AUDIO }),
  }).map(([path, body]) => [`${KIT_ROOT_DIR}/${path}`, Buffer.from(body, 'utf8')]),
);
const kitFileStore = {
  loadTree: async () => ({ engineRef: 'engine-1', sha256: 'a'.repeat(64), files }),
} as never as KitFileStore;
const store = {
  getSubmission: async () => ({ roundKitEngineRef: 'engine-1', roundGeneration: 3, builder: 'platform' }),
};
const input = (gameJson: string) =>
  ({
    jobId: 7,
    slug: 'my-game',
    mode: 'preview',
    files: [{ path: 'GAME.json', content: gameJson }],
  }) as never as SourceDeliveryInput;
const service = (accepted: boolean): SourceDeliveryService => ({
  deliver: async () => ({ accepted }) as never as SourceDeliveryOutcome,
});

describe('withAudioProfileLog', () => {
  it('logs the profile of an accepted delivery, wanted sounds included', async () => {
    const lines: Array<[object, string]> = [];
    const log = { info: (context: object, message: string) => void lines.push([context, message]) };
    const wrapped = withAudioProfileLog(service(true), { store: store as never, kitFileStore, log });
    await wrapped.deliver(input(JSON.stringify({ audio: { ...AUDIO, wanted: ['robot servo whirr'] } })));
    expect(lines).toEqual([
      [
        {
          audio: expect.objectContaining({
            jobId: 7,
            roundGeneration: 3,
            builder: 'platform',
            starterCopy: 'arena-tag',
            starterMusic: true,
            wanted: ['robot servo whirr'],
          }),
        },
        DELIVERY_AUDIO_PROFILE_MSG,
      ],
    ]);
  });

  it('logs nothing for a refusal and never fails a delivery over the metric', async () => {
    const lines: unknown[] = [];
    const log = { info: () => void lines.push(1) };
    await withAudioProfileLog(service(false), { store: store as never, kitFileStore, log }).deliver(input('{}'));
    const broken = { loadTree: async () => Promise.reject(new Error('gone')) } as never as KitFileStore;
    const outcome = await withAudioProfileLog(service(true), {
      store: store as never,
      kitFileStore: broken,
      log,
    }).deliver(input(JSON.stringify({ audio: AUDIO })));
    expect(outcome.accepted).toBe(true);
    expect(lines).toEqual([]);
  });
});

describe('computeStageAdvisories audio fit', () => {
  it('advises, without flagging a defect, when GAME.json keeps a starter audio block', async () => {
    const result = await computeStageAdvisories({
      kitFileStore,
      gamesStore: { getStagedSourceFiles: async () => [] } as never,
      store: { getPublication: async () => null, listSubmissionsBySlug: async () => [] } as never,
      record: {},
      slug: 'my-game',
      jobId: 1,
      roundGeneration: 1,
      engineRef: 'engine-1',
      path: 'GAME.json',
      content: JSON.stringify({ audio: { ...AUDIO, sounds: ['lose', 'win'] } }),
    });
    expect(result.audioHint).toBeUndefined();
    expect(result.audioFitHint).toMatch(/"arena-tag" starter/);
  });
});
