import { describe, expect, it } from 'vitest';
import { formatAssessmentChecklist, isAssessmentChecklist } from './review-checklist.js';

describe('review checklist', () => {
  it('accepts a complete mark set and rejects gaps', () => {
    expect(
      isAssessmentChecklist({
        graphics: 'ok',
        gameplay: 'weak',
        fun: 'ok',
        sound: 'bad',
        controls: 'ok',
      }),
    ).toBe(true);
    expect(
      isAssessmentChecklist({
        graphics: 'ok',
        gameplay: 'ok',
        fun: 'ok',
        sound: 'ok',
      }),
    ).toBe(false);
  });

  it('formats a compact operator line', () => {
    expect(
      formatAssessmentChecklist({
        graphics: 'ok',
        gameplay: 'weak',
        fun: 'ok',
        sound: 'bad',
        controls: 'ok',
      }),
    ).toBe('graphics ok · gameplay weak · fun ok · sound bad · controls ok');
  });
});
