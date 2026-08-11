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

  it('gives the builder pill its own row, pinned left, instead of the collapsed grid row', () => {
    // The one-row grid otherwise squeezes the pill next to send.
    const override = firstRuleBody(
      '.status-composer.is-compact.is-empty:has(.status-composer-toolbar-left:not(:empty))',
    );
    expect(override).toMatch(/display:\s*flex/);
    expect(override).toMatch(/flex-direction:\s*column/);

    const toolbarLeft = firstRuleBody(
      '.status-composer.is-compact.is-empty:has(.status-composer-toolbar-left:not(:empty))\n  .status-composer-toolbar-left',
    );
    expect(toolbarLeft).toMatch(/flex:\s*1/);
  });
});

describe('escape hatch mobile touch target', () => {
  it('grows the escape hatch to the same 44px floor as send on phones', () => {
    const marker =
      '.status-composer.is-compact .status-composer-send,\n  .status-composer.is-compact .status-composer-escape {';
    const start = css.indexOf(marker);
    expect(start, 'escape hatch is not sized alongside send in the mobile rule').toBeGreaterThan(-1);
    const end = css.indexOf('}', start);
    const body = css.slice(start + marker.length, end);
    expect(body).toMatch(/width:\s*44px/);
    expect(body).toMatch(/height:\s*44px/);
  });
});
