import { describe, expect, it } from 'vitest';
import {
  fitsAttachment,
  MAX_COMPOSER_ATTACHMENTS,
  withAttachment,
  type ComposerAttachment,
} from './composerAttachments.js';

function frame(id: string, replacedBy?: string): ComposerAttachment {
  return { id, name: 'AI concept', dataUrl: `data:image/png;base64,${id}`, ...(replacedBy ? { replacedBy } : {}) };
}

describe('withAttachment', () => {
  it('keeps one proposal frame when the creator picks again', () => {
    const first = withAttachment([], frame('a'), { replaces: 'proposal' });
    const second = withAttachment(first, frame('b'), { replaces: 'proposal' });

    expect(second.map((item) => item.id)).toEqual(['b']);
  });

  it('never displaces an attachment the creator added', () => {
    const mine: ComposerAttachment = { id: 'sketch', name: 'Sketch 1', dataUrl: 'data:image/png;base64,MINE' };
    const withFrame = withAttachment([mine], frame('a'), { replaces: 'proposal' });
    const repicked = withAttachment(withFrame, frame('b'), { replaces: 'proposal' });

    expect(repicked.map((item) => item.id)).toEqual(['sketch', 'b']);
  });

  it('still refuses to go past the cap', () => {
    const full = Array.from({ length: MAX_COMPOSER_ATTACHMENTS }, (_, index) => frame(`f${index}`));

    expect(withAttachment(full, frame('extra'))).toEqual(full);
  });
});

describe('fitsAttachment', () => {
  const mine = (id: string): ComposerAttachment => ({ id, name: id, dataUrl: `data:image/png;base64,${id}` });

  it('counts the slot a superseded frame gives back', () => {
    const full = [mine('a'), mine('b'), mine('c'), frame('old', 'proposal')];

    expect(fitsAttachment(full, { replaces: 'proposal' })).toBe(true);
    expect(fitsAttachment(full)).toBe(false);
  });

  it("says no when the creator's own images fill the composer", () => {
    const full = Array.from({ length: MAX_COMPOSER_ATTACHMENTS }, (_, index) => mine(`m${index}`));

    // Nothing carries `replacedBy`, so a pick has no slot to take.
    expect(fitsAttachment(full, { replaces: 'proposal' })).toBe(false);
  });
});
