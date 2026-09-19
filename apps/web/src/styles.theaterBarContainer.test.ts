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

describe('theater bar container queries', () => {
  it('compacts chrome from the bar width, so an inset agent rail still sheds controls', () => {
    const bar = ruleBody('.game-theater-bar');
    expect(bar).toMatch(/container-type:\s*inline-size/);
    expect(bar).toMatch(/container-name:\s*theater-bar/);
    expect(css).toMatch(/@container\s+theater-bar\s+\(max-width:\s*768px\)/);
    expect(css).toMatch(/@container\s+theater-bar\s+\(max-width:\s*900px\)/);
    expect(css).toMatch(
      /@container\s+theater-bar\s+\(max-width:\s*768px\)[\s\S]*?\.theater-desktop-chrome\s*\{[\s\S]*?display:\s*none/,
    );
  });
});
