import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]+)\\}`, 'm').exec(css);
  expect(match, `no ${selector} rule in styles.css`).not.toBeNull();
  return match![1]!;
}

describe('game download bar', () => {
  it('draws a download track under the mascot, matching the in-game decode bar', () => {
    const bar = ruleBody('.app-loading-screen__bar');
    expect(bar).toMatch(/width:\s*min\(240px,\s*70vw\)/);
    expect(bar).toMatch(/height:\s*8px/);
    expect(bar).toMatch(/overflow:\s*hidden/);
    expect(ruleBody('.app-loading-screen__bar-fill')).toMatch(/background:\s*var\(--turquoise/);
  });
});
