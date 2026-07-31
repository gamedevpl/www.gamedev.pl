import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

function ruleBody(selector: string): string {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  expect(start, `no ${selector} rule in styles.css`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(start);
  return css.slice(start + marker.length, end);
}

describe('catalog grid next to in-progress cards', () => {
  /**
   * Regression: an in-progress "Yours" card in the first row stretched the published
   * neighbours to its height. Those cards are only a 16:9 video, so the stretch showed
   * up as empty padding under the preview.
   */
  it('does not stretch cards in a row to the tallest neighbour', () => {
    const rule = ruleBody('.catalog-grid');
    expect(rule).toMatch(/align-items:\s*start/);
  });

  it('keeps published cards as a single 16:9 media box', () => {
    expect(ruleBody('.catalog-media')).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
  });
});
