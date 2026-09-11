import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./status-composer.css', import.meta.url)), 'utf8');

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
    // Key on the pill: toolbar-left also always holds the escape toggle.
    const override = firstRuleBody('.status-composer.is-compact.is-empty:has(.builder-mode-controls:not(:empty))');
    expect(override).toMatch(/display:\s*flex/);
    expect(override).toMatch(/flex-direction:\s*column/);

    const toolbarLeft = firstRuleBody(
      '.status-composer.is-compact.is-empty:has(.builder-mode-controls:not(:empty)) .status-composer-toolbar-left',
    );
    expect(toolbarLeft).toMatch(/flex:\s*1/);
  });

  it('keeps the pill-visible textarea at the 44px mobile floor too', () => {
    // The desktop pill-visible rule would otherwise outrank the plain mobile one.
    const mediaStart = css.indexOf('.status-composer.is-compact .status-composer-send,');
    expect(mediaStart, 'no composer mobile media query found').toBeGreaterThan(-1);
    const marker =
      '.status-composer.is-compact.is-empty:has(.builder-mode-controls:not(:empty)) .status-feedback-input {';
    const start = css.indexOf(marker, mediaStart);
    expect(start, 'no mobile override for the pill-visible textarea').toBeGreaterThan(-1);
    const end = css.indexOf('}', start);
    const body = css.slice(start + marker.length, end);
    expect(body).toMatch(/min-height:\s*44px/);
  });
});

describe('send button mobile touch target', () => {
  it('grows send to a 44px floor on phones', () => {
    // Phone override only — base send stays 34px.
    const marker = '@media (max-width: 768px) {\n  .status-composer.is-compact .status-composer-send {';
    const start = css.indexOf(marker);
    expect(start, 'send is not sized in the phone media query').toBeGreaterThan(-1);
    const bodyStart = start + marker.length;
    const end = css.indexOf('}', bodyStart);
    const body = css.slice(bodyStart, end);
    expect(body).toMatch(/width:\s*44px/);
    expect(body).toMatch(/height:\s*44px/);
  });
});

describe('stop button mobile touch target', () => {
  it('keeps the live-build stop action at the 44px floor on phones', () => {
    const marker = '  .status-composer.is-compact .status-composer-stop {';
    const mediaStart = css.indexOf(
      '@media (max-width: 768px) {',
      css.indexOf('.status-composer.is-compact .status-composer-send {'),
    );
    const start = css.indexOf(marker, mediaStart);
    expect(start, 'stop is not sized in the phone media query').toBeGreaterThan(-1);
    const bodyStart = start + marker.length;
    const end = css.indexOf('}', bodyStart);
    const body = css.slice(bodyStart, end);
    expect(body).toMatch(/width:\s*44px/);
    expect(body).toMatch(/height:\s*44px/);
  });
});

describe('CI repair quick action', () => {
  it('blends into the compact composer instead of sitting above it', () => {
    const quickActions = firstRuleBody('.status-composer.is-compact .status-feedback-quick-actions');
    expect(quickActions).toMatch(/grid-column:\s*1 \/ -1/);
  });

  it('looks interactive and keeps a phone-sized touch target', () => {
    const chip = firstRuleBody('.status-feedback-quick-action');
    expect(chip).toMatch(/border-radius:\s*999px/);
    expect(chip).toMatch(/cursor:\s*pointer/);

    const mediaStart = css.indexOf('@media (max-width: 768px) {', css.indexOf(chip));
    expect(mediaStart, 'no phone media query after the quick action').toBeGreaterThan(-1);
    const marker = '.status-feedback-quick-action {';
    const start = css.indexOf(marker, mediaStart);
    expect(start, 'no phone override for the quick action').toBeGreaterThan(-1);
    const end = css.indexOf('}', start);
    const body = css.slice(start + marker.length, end);
    expect(body).toMatch(/min-height:\s*44px/);
  });
});
