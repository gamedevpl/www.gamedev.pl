import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

// Regression: both CTAs once rendered as bare native buttons.
function ruleFor(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `no ${selector} selector in styles.css`).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  expect(open, `${selector} selector has no rule body`).toBeGreaterThan(start);
  const end = css.indexOf('}', open);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(open);
  return css.slice(open + 1, end);
}

describe('the Code surface primary buttons (Stage it / Deliver)', () => {
  it('are filled turquoise CTAs, not the unstyled native default', () => {
    for (const selector of ['.code-surface-stage-it.is-primary', '.code-surface-deliver-btn.is-primary']) {
      const rule = ruleFor(selector);
      expect(rule).toMatch(/background:\s*var\(--turquoise\)/);
      expect(rule).toMatch(/color:\s*#08241d/);
    }
  });

  it('have an explicit disabled treatment distinct from the enabled fill', () => {
    for (const selector of [
      '.code-surface-stage-it.is-primary:disabled',
      '.code-surface-deliver-btn.is-primary:disabled',
    ]) {
      const rule = ruleFor(selector);
      expect(rule).toMatch(/color:\s*var\(--muted\)/);
    }
  });
});
