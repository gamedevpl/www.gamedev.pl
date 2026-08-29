import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

/**
 * Phone rules live under `@media (max-width: 768px)` — use last match.
 */
function lastRuleBody(selector: string): string {
  const marker = `${selector} {`;
  const start = css.lastIndexOf(marker);
  expect(start, `no ${selector} rule in styles.css`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(start);
  return css.slice(start + marker.length, end);
}

function firstRuleBody(selector: string): string {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  expect(start, `no ${selector} rule in styles.css`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(start);
  return css.slice(start + marker.length, end);
}

describe('desktop hero composer pill', () => {
  it('uses a fixed-height grid so + / field / mic / send share one centerline', () => {
    // 36px field aligns with icon buttons on one midline.
    const bar = firstRuleBody('.prompt-composer-bar');
    expect(bar).toMatch(/display:\s*grid/);
    expect(bar).toMatch(/align-items:\s*center/);
    expect(bar).toMatch(/height:\s*auto/);
    expect(bar).toMatch(/padding:\s*4px 8px/);
    expect(bar).toMatch(/grid-template-columns:\s*36px minmax\(0,\s*1fr\) 36px/);

    const input = firstRuleBody('.big-prompt-input');
    expect(input).toMatch(/height:\s*36px/);
    expect(input).toMatch(/line-height:\s*24px/);
    expect(input).toMatch(/padding:\s*6px 2px/);
    expect(input).toMatch(/font-size:\s*16px/);
    expect(input).not.toMatch(/field-sizing:/);
    expect(input).not.toMatch(/min-height:\s*128px/);
  });

  it('keeps Build as a circular icon send with a clipped label', () => {
    const rule = firstRuleBody('.prompt-composer-bar .build-btn');
    expect(rule).toMatch(/width:\s*36px/);
    expect(rule).toMatch(/height:\s*36px/);
    expect(rule).toMatch(/border-radius:\s*999px/);

    const labelRule = firstRuleBody('.prompt-composer-bar .build-btn-label');
    expect(labelRule).toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  });

  it('keeps a busy send readable: full opacity and a spinner the eye can see', () => {
    // Keep teal opacity so disabled busy does not look broken.
    const busy = firstRuleBody('.prompt-composer-bar .build-btn.is-busy');
    expect(busy).toMatch(/opacity:\s*1/);
    expect(busy).toMatch(/cursor:\s*progress/);

    const spinner = firstRuleBody('.build-btn-spinner');
    expect(spinner).toMatch(/animation:\s*status-spin/);
  });
});

describe('mobile hero composer pill', () => {
  it('keeps + / field / mic on one 44px grid row', () => {
    const bar = lastRuleBody('.prompt-composer-bar');
    expect(bar).toMatch(/grid-template-columns:\s*44px minmax\(0,\s*1fr\) 44px/);
    expect(bar).toMatch(/grid-template-rows:\s*44px auto/);

    const input = lastRuleBody('.big-prompt-input');
    expect(input).toMatch(/height:\s*44px/);
    expect(input).toMatch(/line-height:\s*24px/);
    expect(input).toMatch(/padding:\s*10px 2px/);
    expect(input).toMatch(/font-size:\s*16px/);
    expect(input).not.toMatch(/min-height:\s*128px/);
  });

  it('puts Build on a full-width labeled row under the field', () => {
    const build = lastRuleBody('.prompt-composer-bar .build-btn');
    expect(build).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    expect(build).toMatch(/width:\s*100%/);
  });
});
