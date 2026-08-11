import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

function firstRuleBody(selector: string): string {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  expect(start, `no ${selector} rule in styles.css`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(start);
  return css.slice(start + marker.length, end);
}

describe('studio compact composer empty state', () => {
  it('puts the placeholder and send on one grid row when empty', () => {
    // Empty composers must not stack field over send.
    const empty = firstRuleBody('.status-composer.is-compact.is-empty');
    expect(empty).toMatch(/display:\s*grid/);
    expect(empty).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
    expect(empty).toMatch(/align-items:\s*center/);

    const input = firstRuleBody('.status-composer.is-compact.is-empty .status-feedback-input');
    expect(input).toMatch(/grid-column:\s*1/);
    expect(input).toMatch(/min-height:\s*34px/);
    expect(input).toMatch(/padding:\s*6px\s+0/);

    const toolbar = firstRuleBody('.status-composer.is-compact.is-empty .status-composer-toolbar');
    expect(toolbar).toMatch(/grid-column:\s*2/);
    expect(toolbar).toMatch(/padding-top:\s*0/);
  });

  it('marks the card as a text target so chrome clicks feel like the field', () => {
    const card = firstRuleBody('.status-composer.is-compact');
    expect(card).toMatch(/cursor:\s*text/);
  });
});
