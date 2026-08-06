import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

/**
 * Phone rules for the home composer live under `@media (max-width: 768px)`.
 * Pull the last `.prompt-composer-bar .build-btn` / `.big-prompt-input` block —
 * those are the mobile overrides that must not reintroduce the cramped pill.
 */
function lastRuleBody(selector: string): string {
  const marker = `${selector} {`;
  const start = css.lastIndexOf(marker);
  expect(start, `no ${selector} rule in styles.css`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(start);
  return css.slice(start + marker.length, end);
}

describe('mobile hero composer pill', () => {
  it('does not force a tall empty field inside the pill', () => {
    const rule = lastRuleBody('.big-prompt-input');
    expect(rule).not.toMatch(/min-height:\s*128px/);
    expect(rule).toMatch(/font-size:\s*16px/);
    expect(rule).toMatch(/height:\s*44px/);
  });

  it('puts Build on its own full-width labeled row under + | field | mic', () => {
    const bar = lastRuleBody('.prompt-composer-bar');
    expect(bar).toMatch(/flex-wrap:\s*wrap/);

    const build = lastRuleBody('.prompt-composer-bar .build-btn');
    expect(build).toMatch(/flex:\s*1 1 100%/);
    expect(build).toMatch(/width:\s*100%/);
  });
});

describe('desktop hero composer pill', () => {
  it('keeps a single-line field on the same centerline as the tools', () => {
    // A wrapping textarea placeholder sat above/below the icon midline (the
    // red-line bug). <input type="text"> cannot wrap; height matches the icons.
    const rule = css.slice(css.indexOf('.big-prompt-input {'), css.indexOf('.big-prompt-input:focus'));
    expect(rule).toMatch(/height:\s*36px/);
    expect(rule).toMatch(/line-height:\s*36px/);
    expect(rule).not.toMatch(/min-height:\s*128px/);
    expect(rule).not.toMatch(/field-sizing:/);
  });

  it('keeps Build as a circular icon send with a clipped label', () => {
    // First (desktop) rule — lastIndex would hit the phone override.
    const marker = '.prompt-composer-bar .build-btn {';
    const start = css.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const end = css.indexOf('}', start);
    const rule = css.slice(start + marker.length, end);
    expect(rule).toMatch(/width:\s*36px/);
    expect(rule).toMatch(/height:\s*36px/);
    expect(rule).toMatch(/border-radius:\s*999px/);

    const labelStart = css.indexOf('.prompt-composer-bar .build-btn-label {');
    expect(labelStart).toBeGreaterThan(-1);
    const labelEnd = css.indexOf('}', labelStart);
    const labelRule = css.slice(labelStart, labelEnd);
    expect(labelRule).toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  });

  it('centers a compact single-line bar instead of bottom-aligning a tall field', () => {
    const marker = '.prompt-composer-bar {';
    const start = css.indexOf(marker);
    const end = css.indexOf('}', start);
    const rule = css.slice(start + marker.length, end);
    expect(rule).toMatch(/align-items:\s*center/);
    expect(rule).toMatch(/min-height:\s*52px/);
    expect(rule).not.toMatch(/align-items:\s*flex-end/);
  });
});
