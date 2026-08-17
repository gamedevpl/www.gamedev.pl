import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleBody(selector: string): string {
  const regex = new RegExp(`${escapeRegex(selector)}\\s*\\{([^}]+)\\}`);
  const match = css.match(regex);
  expect(match, `no ${selector} rule in styles.css`).not.toBeNull();
  return match![1]!;
}

describe('catalog grid layout', () => {
  /**
   * Cards in a row must not stretch to a taller neighbour — published cards are a
   * single 16:9 media box, and any leftover empty padding under the preview looks broken.
   */
  it('does not stretch cards in a row to the tallest neighbour', () => {
    const rule = ruleBody('.catalog-grid');
    expect(rule).toMatch(/align-items:\s*start/);
  });

  it('keeps published cards as a single 16:9 media box', () => {
    expect(ruleBody('.catalog-media')).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
  });

  it('hides the moments-only toggle on coarse pointers, but keeps the video one tappable', () => {
    const rule = css.match(/\.preview-toggle:not\(\.preview-toggle--video\)\s*,\s*\.catalog-moments\s*\{([\s\S]*?)\}/);
    expect(rule, 'missing combined preview-toggle/catalog-moments hide rule').not.toBeNull();
    expect(rule![1]).toMatch(/display:\s*none/);
    // Same rule lives under the coarse/phone media query (look behind a short window).
    const at = css.indexOf(rule![0]!);
    expect(css.slice(Math.max(0, at - 240), at)).toMatch(
      /@media\s*\(\s*pointer:\s*coarse\s*\)\s*,\s*\(\s*max-width:\s*768px\s*\)/,
    );
  });
});
