import { describe, expect, it, vi } from 'vitest';
import { attachVisualTarget, MAX_REFERENCE_IMAGES, pickVisualTarget, type QaVisualTarget } from './qaVisualTarget.js';

const STYLE = {
  id: 'style',
  question: 'What visual direction should the game use?',
  options: [{ label: 'Household Tabletop' }, { label: 'Stylized Race Tracks' }],
};
const MODE = { id: 'mode', question: 'Single race or a cup?', options: [{ label: 'Single' }, { label: 'Cup' }] };
const TILES = {
  style: { 'Household Tabletop': 'data:image/webp;base64,AAA', 'Stylized Race Tracks': 'data:image/webp;base64,BBB' },
};

describe('picking the tile the creator chose', () => {
  it('returns the illustrated pick with its question', () => {
    expect(pickVisualTarget([MODE, STYLE], TILES, { mode: ['Cup'], style: ['Stylized Race Tracks'] })).toEqual({
      question: STYLE.question,
      label: 'Stylized Race Tracks',
      dataUrl: 'data:image/webp;base64,BBB',
    });
  });

  it('skips a question answered only in free text', () => {
    expect(pickVisualTarget([STYLE], TILES, {})).toBeUndefined();
  });

  // A partial set is never shown, so it cannot have been picked.
  it('ignores a question whose tiles did not all arrive', () => {
    const partial = { style: { 'Stylized Race Tracks': 'data:image/webp;base64,BBB' } };
    expect(pickVisualTarget([STYLE], partial, { style: ['Stylized Race Tracks'] })).toBeUndefined();
  });
});

describe('attaching the tile for the agent', () => {
  const target: QaVisualTarget = {
    question: STYLE.question,
    label: 'Stylized Race Tracks',
    dataUrl: 'data:image/webp;base64,BBB',
  };

  it('appends the tile after the creator images and labels it in the concept', async () => {
    const toPng = vi.fn(async () => 'PNG');
    const result = await attachVisualTarget('Toy cars racing', ['OWN'], target, toPng);

    expect(toPng).toHaveBeenCalledWith(target.dataUrl);
    // Last in, so it is the newest reference the agent must open.
    expect(result.referenceImages).toEqual(['OWN', 'PNG']);
    expect(result.concept).toMatch(/^Toy cars racing\n\n## Visual target\n/);
    expect(result.concept).toContain('"What visual direction should the game use" (answer: Stylized Race Tracks)');
  });

  it('leaves everything as it was without a tile', async () => {
    expect(await attachVisualTarget('Toy cars', undefined, undefined, async () => 'PNG')).toEqual({
      concept: 'Toy cars',
      referenceImages: undefined,
    });
  });

  // The creator's own images outrank an illustration of a label.
  it('gives up the tile when the creator already filled every slot', async () => {
    const own = Array.from({ length: MAX_REFERENCE_IMAGES }, (_, i) => `OWN${i}`);
    const toPng = vi.fn(async () => 'PNG');
    const result = await attachVisualTarget('Toy cars', own, target, toPng);

    expect(result).toEqual({ concept: 'Toy cars', referenceImages: own });
    expect(toPng).not.toHaveBeenCalled();
  });

  it('drops the note too when the tile cannot be converted', async () => {
    expect(await attachVisualTarget('Toy cars', ['OWN'], target, async () => null)).toEqual({
      concept: 'Toy cars',
      referenceImages: ['OWN'],
    });
  });
});
