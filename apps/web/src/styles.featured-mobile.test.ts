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

  it('fits play and a two-line teaser on a phone', () => {
    expect(ruleBody('.featured-game-media', 'last')).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);

    const body = ruleBody('.featured-game-body', 'last');
    expect(body).toMatch(/flex-wrap:\s*wrap/);

    const title = ruleBody('.featured-game-title', 'last');
    expect(title).toMatch(/order:\s*2/);
    expect(title).toMatch(/flex:\s*1\s+1\s+10rem/);

    const actions = ruleBody('.featured-game-actions', 'last');
    expect(actions).toMatch(/order:\s*3/);
    expect(actions).toMatch(/margin-top:\s*0/);

    const meta = ruleBody('.featured-game-meta', 'last');
    expect(meta).toMatch(/order:\s*4/);
    expect(meta).toMatch(/-webkit-line-clamp:\s*2/);

    expect(ruleBody('.hero-prompt-section', 'last')).toMatch(/margin-bottom:\s*12px/);
  });
});
