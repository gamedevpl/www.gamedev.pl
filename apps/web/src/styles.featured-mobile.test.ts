import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

function ruleBody(selector: string, which: 'first' | 'last'): string {
  const marker = `${selector} {`;
  const start = which === 'first' ? css.indexOf(marker) : css.lastIndexOf(marker);
  expect(start, `no ${selector} rule in styles.css`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(start);
  return css.slice(start + marker.length, end);
}

describe('mobile featured slot', () => {
  it('keeps the desktop poster wide and the blurb unclamped', () => {
    const media = ruleBody('.featured-game-media', 'first');
    expect(media).toMatch(/aspect-ratio:\s*16\s*\/\s*10/);
    expect(ruleBody('.featured-game-meta', 'first')).not.toMatch(/line-clamp/);
    expect(ruleBody('.hero-prompt-section', 'first')).toMatch(/margin-bottom:\s*48px/);
  });

  it('keeps a phone card to the poster, the title, and play', () => {
    expect(ruleBody('.featured-game-media', 'last')).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);

    const hiddenStart = css.lastIndexOf('.featured-game-kicker,');
    expect(hiddenStart).toBeGreaterThan(-1);
    const hidden = css.slice(hiddenStart, css.indexOf('}', hiddenStart));
    expect(hidden).toMatch(/\.featured-game-meta,/);
    expect(hidden).toMatch(/\.featured-game-author/);
    expect(hidden).toMatch(/display:\s*none/);
    expect(ruleBody('.featured-game-kicker', 'first')).toMatch(/display:\s*inline-flex/);

    expect(ruleBody('.featured-game-body', 'last')).toMatch(/flex-wrap:\s*wrap/);
    expect(ruleBody('.featured-game-title', 'last')).toMatch(/flex:\s*1\s+1\s+10rem/);
    expect(ruleBody('.featured-game-actions', 'last')).toMatch(/margin-top:\s*0/);
    expect(ruleBody('.hero-prompt-section', 'last')).toMatch(/margin-bottom:\s*12px/);
  });
});
