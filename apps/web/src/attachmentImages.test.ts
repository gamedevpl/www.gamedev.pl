// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_SHOT_BYTES } from '@gamedevpl/contract';
import { toBase64Png } from './attachmentImages.js';

const MAX_PNG_BASE64_CHARS = Math.ceil(MAX_SHOT_BYTES / 3) * 4;

describe('attachment image normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps a small PNG without decoding it', async () => {
    const imageConstructor = vi.fn(() => {
      throw new Error('small PNG should not be decoded');
    });
    vi.stubGlobal('Image', imageConstructor);

    await expect(toBase64Png('data:image/png;base64,small')).resolves.toBe('small');
    expect(imageConstructor).not.toHaveBeenCalled();
  });

  it('resizes an oversized PNG until it fits the shared upload budget', async () => {
    class FakeImage {
      naturalWidth = 3200;
      naturalHeight = 2000;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        this.onload?.();
      }
    }

    const drawImage = vi.fn();
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValueOnce(`data:image/png;base64,${'x'.repeat(MAX_PNG_BASE64_CHARS + 1)}`)
      .mockReturnValue(`data:image/png;base64,small`);

    await expect(toBase64Png(`data:image/png;base64,${'x'.repeat(MAX_PNG_BASE64_CHARS + 1)}`)).resolves.toBe('small');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1000);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1200, 750);
  });
});
