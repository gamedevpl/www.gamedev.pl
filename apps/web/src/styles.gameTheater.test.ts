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

describe('game theater floating bar', () => {
  it('overlays the full-height game instead of taking a flex row', () => {
    const bar = ruleBody('.game-theater-bar');

    expect(bar).toMatch(/position:\s*absolute/);
    expect(bar).toMatch(/top:\s*0/);
    expect(bar).toMatch(/left:\s*0/);
    expect(bar).toMatch(/right:\s*0/);
    expect(ruleBody('.game-viewport-container')).toMatch(/flex:\s*1/);
  });

  it('keeps the game visible through a blurred, translucent surface', () => {
    const bar = ruleBody('.game-theater-bar');

    expect(bar).toMatch(/background:\s*rgba\(12,\s*18,\s*24,\s*0\.72\)/);
    expect(bar).toMatch(/backdrop-filter:\s*blur\(16px\)/);
  });

  it('fades slowly and becomes non-interactive once the player is idle', () => {
    const bar = ruleBody('.game-theater-bar');
    const idle = ruleBody('.game-theater-bar.is-idle');

    expect(bar).toMatch(/opacity\s+700ms\s+ease/);
    expect(idle).toMatch(/opacity:\s*0/);
    expect(idle).toMatch(/visibility:\s*hidden/);
    expect(idle).toMatch(/pointer-events:\s*none/);
    expect(idle).toMatch(/transition-delay:\s*0s,\s*0s,\s*700ms/);
  });
});
