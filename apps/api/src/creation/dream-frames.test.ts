import { describe, expect, it } from 'vitest';
import { buildDreamPrompt, StubDreamFrameGenerator } from './dream-frames.js';

const base = {
  sourcePng: 'AAAA',
  width: 900,
  height: 900,
  styleNote: '"Parcel Run", a browser game: deliver parcels in space',
  direction: 'Add a second, smaller moon in the background',
};

describe('buildDreamPrompt', () => {
  it('locks every declared HUD rectangle by name and pixel bounds', () => {
    const prompt = buildDreamPrompt({
      ...base,
      hudRegions: [
        { x: 16, y: 16, w: 200, h: 40, label: 'score' },
        { x: 700, y: 16, w: 184, h: 40 },
      ],
    });
    expect(prompt).toContain('900x900 screenshot of "Parcel Run"');
    expect(prompt).toContain('CHANGE: Add a second, smaller moon in the background');
    expect(prompt).toContain('HUD LOCK RULE');
    expect(prompt).toContain('- "score": the rectangle from x=16, y=16 to x=216, y=56');
    expect(prompt).toContain('- HUD element 2: the rectangle from x=700, y=16 to x=884, y=56');
  });

  it('asks the model to find and lock the UI itself when no HUD is declared', () => {
    const prompt = buildDreamPrompt({ ...base, hudRegions: [] });
    expect(prompt).not.toContain('HUD LOCK RULE');
    expect(prompt).toContain('UI LOCK RULE');
    expect(prompt).toContain('find every piece of the game');
    expect(prompt).toContain('must not add any new text');
    expect(prompt).toContain('same size as the input');
  });
});

describe('StubDreamFrameGenerator', () => {
  it('records requests and answers with the configured frame', async () => {
    const stub = new StubDreamFrameGenerator({ data: 'ZZ', mediaType: 'image/jpeg' });
    await expect(stub.generate({ ...base, hudRegions: [] })).resolves.toEqual({ data: 'ZZ', mediaType: 'image/jpeg' });
    expect(stub.requests).toHaveLength(1);
  });
});
