import { describe, expect, it } from 'vitest';
import { encodePng } from '../platform/image-rgba.js';
import { harness } from './dream-job.harness.js';

function flatPng(width: number, height: number): Buffer {
  return encodePng({ data: new Uint8ClampedArray(width * height * 4).fill(90), width, height });
}

describe('dream job source scaling', () => {
  it('scales a large capture and its declared HUD by the same ratio', async () => {
    const { frames, run } = await harness({
      artifacts: { 'media/opening.png': flatPng(2048, 2048) },
      hud: [{ x: 200, y: 100, w: 400, h: 80 }],
    });
    expect(await run()).toBe('posted');
    const request = frames.requests[0]!;
    expect({ width: request.width, height: request.height }).toEqual({ width: 1024, height: 1024 });
    expect(request.hudRegions).toEqual([{ x: 100, y: 50, w: 200, h: 40 }]);
  });
});
