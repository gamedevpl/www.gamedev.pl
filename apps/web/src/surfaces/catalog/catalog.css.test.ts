import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./catalog.css', import.meta.url)), 'utf8');
const toolbarCss = readFileSync(fileURLToPath(new URL('./catalog-toolbar.css', import.meta.url)), 'utf8');

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleBody(source: string, selector: string): string {
  const regex = new RegExp(`${escapeRegex(selector)}\\s*\\{([^}]+)\\}`);
  const match = source.match(regex);
  expect(match, `no ${selector} rule found`).not.toBeNull();
  return match![1]!;
}

// A card can't stretch to match a taller neighbor's height.
describe('catalog grid layout', () => {
  it('does not stretch cards in a row to the tallest neighbour', () => {
    const rule = ruleBody(css, '.catalog-grid');
    expect(rule).toMatch(/align-items:\s*start/);
  });

  it('keeps published cards as a single 16:9 media box', () => {
    expect(ruleBody(css, '.catalog-media')).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
  });

  it('keeps the footer below the fold while the catalog settles', () => {
    const rule = ruleBody(toolbarCss, '.arcade-section.is-pending');
    expect(rule).toMatch(/min-height:\s*100vh/);
    expect(rule).toMatch(/min-height:\s*100dvh/);
  });

  it('hides the moments-only toggle on coarse pointers, but keeps the video one tappable', () => {
    const rule = css.match(/\.preview-toggle:not\(\.preview-toggle--video\)\s*,\s*\.catalog-moments\s*\{([\s\S]*?)\}/);
    expect(rule, 'missing combined preview-toggle/catalog-moments hide rule').not.toBeNull();
    expect(rule![1]).toMatch(/display:\s*none/);
    // Same rule sits under the coarse/phone media query above.
    const at = css.indexOf(rule![0]!);
    expect(css.slice(Math.max(0, at - 240), at)).toMatch(
      /@media\s*\(\s*pointer:\s*coarse\s*\)\s*,\s*\(\s*max-width:\s*768px\s*\)/,
    );
  });
});

// Regression: an equal-specificity mobile override must load after the base rule.
describe('catalog mobile overrides', () => {
  it('collapses the grid to one column under 768px, loaded after the base rule', () => {
    expect(css).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.catalog-grid \{[\s\S]*grid-template-columns: 1fr;/);
  });

  it('widens the tap targets under 768px, loaded after the base rules', () => {
    expect(toolbarCss).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*\.catalog-toolbar \{[\s\S]*max-width: min\(100%, 22rem\);/,
    );
    expect(toolbarCss).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*\.catalog-filter-trigger,\s*\n\s*\.catalog-sort-trigger \{[\s\S]*min-height: 44px;/,
    );
  });
});
