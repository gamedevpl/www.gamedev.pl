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
  it('does not force a tall empty textarea inside the pill', () => {
    // The pre-pill card used 128px so a Polish placeholder fit; that floor turns
    // the Gemini-style bar into a crushed box on a phone.
    const rule = lastRuleBody('.big-prompt-input');
    expect(rule).not.toMatch(/min-height:\s*128px/);
    expect(rule).toMatch(/font-size:\s*16px/);
  });

  it('puts Build on its own full-width row under + | field | mic', () => {
    const bar = lastRuleBody('.prompt-composer-bar');
    expect(bar).toMatch(/flex-wrap:\s*wrap/);

    const build = lastRuleBody('.prompt-composer-bar .build-btn');
    expect(build).toMatch(/flex:\s*1 1 100%/);
    expect(build).toMatch(/width:\s*100%/);
  });
});
