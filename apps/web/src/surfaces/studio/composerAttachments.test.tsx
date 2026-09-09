import { describe, expect, it } from 'vitest';
import { MAX_COMPOSER_ATTACHMENTS, withAttachment, type ComposerAttachment } from './composerAttachments.js';

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
