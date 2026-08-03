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

  it('hides trailer/moment chrome on coarse pointers so cards keep one Play CTA', () => {
    expect(css).toMatch(
      /@media\s*\(\s*pointer:\s*coarse\s*\)\s*,\s*\(\s*max-width:\s*768px\s*\)\s*\{[^}]*\.preview-toggle\s*,\s*\.catalog-moments\s*\{[^}]*display:\s*none/s,
    );
  });
});
