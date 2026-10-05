import { describe, expect, it } from 'vitest';
import { jpegHeader } from '../platform/image-size.test.js';
import { harness } from './dream-job.harness.js';

describe('createDreamJob image-model throttling', () => {
  it('waits out image-model throttling and still posts', async () => {
    let calls = 0;
    const { run, waits } = await harness({
      hud: [],
      frame: () => {
        calls += 1;
        // Two refusals per frame, as production sees.
        if (calls % 3 !== 0) throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
        return { data: jpegHeader(1024, 1024).toString('base64'), mediaType: 'image/jpeg' };
      },
    });
    expect(await run()).toBe('posted');
    expect(calls).toBe(6);
    expect(waits).toEqual([15_000, 30_000, 15_000, 30_000]);
  });

  it('gives up on a frame after the last throttled attempt', async () => {
    const { frames, run, waits } = await harness({
      hud: [],
      frame: () => {
        throw new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}');
      },
    });
    expect(await run()).toBe('no_frames');
    expect(frames.requests).toHaveLength(8);
    expect(waits).toEqual([15_000, 30_000, 45_000, 15_000, 30_000, 45_000]);
  });

  it('stops retrying a throttled frame once dreaming is paused during the wait', async () => {
    const hooks: { pause?: () => Promise<unknown> } = {};
    const { store, frames, run, waits } = await harness({
      hud: [],
      frame: async () => {
        // The operator pulls the switch while the job backs off.
        await hooks.pause?.();
        throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
      },
    });
    hooks.pause = () => store.setCreationLimits({ dreamsPaused: true }, 'g:boss');
    expect(await run()).toBe('paused');
    expect(frames.requests).toHaveLength(1);
    expect(waits).toEqual([15_000]);
  });

  it('does not retry a frame that failed for a reason other than throttling', async () => {
    const { frames, run, waits } = await harness({
      hud: [],
      frame: () => {
        throw new Error('safety block');
      },
    });
    expect(await run()).toBe('no_frames');
    expect(frames.requests).toHaveLength(2);
    expect(waits).toEqual([]);
  });
});
