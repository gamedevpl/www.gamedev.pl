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

describe('compact Sent! receipt overlay', () => {
  const floating = ruleBody('.status-feedback-receipt.is-floating');

  it('is pinned inside the composer so wrapped copy cannot cover Stop', () => {
    // Codex review on #441: bottom-only absolute placement let three-line English/Polish
    // confirmation strings grow taller than the resting composer and spill into the
    // thread context bar. Top + bottom keep the overlay in the padding box.
    expect(floating).toMatch(/top:\s*8px/);
    expect(floating).toMatch(/bottom:\s*8px/);
    expect(floating).toMatch(/overflow:\s*hidden/);
  });

  it('lets clicks reach the textarea while keeping dismiss tappable', () => {
    expect(floating).toMatch(/pointer-events:\s*none/);
    expect(ruleBody('.status-feedback-receipt-dismiss')).toMatch(/pointer-events:\s*auto/);
  });
});
