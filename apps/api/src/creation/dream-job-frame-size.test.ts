import { describe, expect, it } from 'vitest';
import { jpegHeader } from '../platform/image-size.test.js';
import { MAX_DREAM_FRAME_BYTES } from './dream-job.js';
import { harness, log } from './dream-job.harness.js';

describe('createDreamJob frame size', () => {
  it('says why it dropped a frame too big for a shot document', async () => {
    const warnings: { context: object; message: string }[] = [];
    // The image model's PNGs ran 1–1.7 MB in production.
    const oversized = Buffer.concat([jpegHeader(1024, 1024), Buffer.alloc(MAX_DREAM_FRAME_BYTES)]);
    const { store, run } = await harness({
      hud: [],
      frame: { data: oversized.toString('base64'), mediaType: 'image/jpeg' },
      log: { ...log, warn: (context, message) => warnings.push({ context, message }) },
    });

    expect(await run()).toBe('no_frames');
    expect(await store.listCreatorMessages(7)).toEqual([]);
    expect(warnings.filter((warning) => warning.message === 'dream frame refused')).toHaveLength(2);
    expect(warnings[0]?.context).toMatchObject({ jobId: 7, reason: expect.stringMatching(/over the shot limit/) });
  });
});
