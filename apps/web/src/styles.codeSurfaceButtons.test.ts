import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

// Regression: the Publish CTA once rendered as a bare native button.
function ruleFor(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `no ${selector} selector in styles.css`).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  expect(open, `${selector} selector has no rule body`).toBeGreaterThan(start);
  const end = css.indexOf('}', open);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(open);
  return css.slice(open + 1, end);
}

describe('the Code surface Publish button', () => {
  it('is a filled turquoise CTA, not the unstyled native default', () => {
    const rule = ruleFor('.code-surface-deliver-btn.is-primary');
    expect(rule).toMatch(/background:\s*var\(--turquoise\)/);
    expect(rule).toMatch(/color:\s*#08241d/);
  });

  it('has an explicit disabled treatment distinct from the enabled fill', () => {
    const rule = ruleFor('.code-surface-deliver-btn.is-primary:disabled');
    expect(rule).toMatch(/color:\s*var\(--muted\)/);
  });

  it('no longer ships a separate Stage-it primary CTA — preview rebuilds on autosave', () => {
    expect(css).not.toMatch(/\.code-surface-stage-it/);
  });

  it('keeps Code navigation beside the global escape', () => {
    expect(ruleFor('.code-surface-head')).toMatch(/padding:\s*10px 14px/);
    expect(ruleFor('.studio-stage-layout:has(.studio-code-overlay) .code-surface-head')).toMatch(
      /padding-left:\s*180px/,
    );
    expect(ruleFor('.studio-stage-layout:has(.studio-code-overlay) .studio-fullbleed')).toMatch(/top:\s*10px/);
  });

  it('gives the global escape its own row on narrow phones', () => {
    expect(css).toMatch(
      /@media \(max-width: 600px\)[\s\S]*?\.studio-stage-layout:has\(\.studio-code-overlay\) \.code-surface-head \{\s*padding: 52px 14px 10px;/,
    );
  });

  it('keeps mobile file navigation on demand instead of rendering a tab rail', () => {
    expect(css).not.toMatch(/\.code-surface-file-select/);
    expect(css).toMatch(/\.code-surface-file-trigger-path[\s\S]*?text-overflow:\s*ellipsis/);
    expect(css).toMatch(
      /@media \(max-width: 1099px\)[\s\S]*?\.code-surface-file-backdrop \{\s*position: absolute;[\s\S]*?\.code-surface-file-sheet \{\s*position: relative;/,
    );
    expect(css).toMatch(/\.code-surface-file-option \{[\s\S]*?min-height: 44px/);
  });
});
