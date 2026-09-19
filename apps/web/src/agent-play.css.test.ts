import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./agent-play.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]+)\\}`, 'm').exec(css);
  expect(match, `no ${selector} rule in agent-play.css`).not.toBeNull();
  return match![1]!;
}

describe('agent play mode layout', () => {
  it('defines insets on .has-agent-panel so the game canvas reflows beside the panel', () => {
    const rootRule = ruleBody('.has-agent-panel');
    expect(rootRule).toMatch(/--agent-inset-right:\s*min\(460px,\s*46vw\)/);
    expect(rootRule).toMatch(/--agent-inset-bottom:\s*0px/);
  });

  it('insets the game viewport container and bar without overlapping the canvas', () => {
    const container = ruleBody('.is-playing-full-viewport.has-agent-panel .game-viewport-container');
    expect(container).toMatch(/align-self:\s*stretch/);
    expect(container).toMatch(/margin-right:\s*var\(--agent-inset-right\)/);
    expect(container).toMatch(/margin-bottom:\s*var\(--agent-inset-bottom\)/);
    expect(container).toMatch(/width:\s*auto/);

    const bar = ruleBody('.is-playing-full-viewport.has-agent-panel .game-theater-bar');
    expect(bar).toMatch(/right:\s*var\(--agent-inset-right\)/);
    expect(bar).toMatch(/width:\s*auto/);
    expect(bar).toMatch(/z-index:\s*90/);
  });

  it('keeps the theater reveal and fullscreen exit buttons in the visible game area', () => {
    const reveal = ruleBody('.is-playing-full-viewport.has-agent-panel .theater-reveal-btn');
    expect(reveal).toMatch(
      /right:\s*calc\(var\(--agent-inset-right\)\s*\+\s*max\(12px,\s*env\(safe-area-inset-right\)\)\)/,
    );

    const exitFullscreen = ruleBody('.is-playing-full-viewport.has-agent-panel .theater-exit-fullscreen');
    expect(exitFullscreen).toMatch(/left:\s*auto/);
    expect(exitFullscreen).toMatch(
      /right:\s*calc\(var\(--agent-inset-right\)\s*\+\s*max\(12px,\s*env\(safe-area-inset-right\)\)\)/,
    );
    expect(exitFullscreen).toMatch(
      /bottom:\s*calc\(var\(--agent-inset-bottom\)\s*\+\s*max\(12px,\s*env\(safe-area-inset-bottom\)\)\)/,
    );
  });

  it('flips the insets on phones so the canvas keeps the top and panel stays at the bottom', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?--agent-inset-right:\s*0px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?--agent-inset-bottom:\s*55dvh/);
  });

  it('raises the inset theater bar above the rail so the More popup stays usable', () => {
    const bar = ruleBody('.is-playing-full-viewport.has-agent-panel .game-theater-bar');
    const rail = ruleBody('.agent-play');
    const barZ = Number(/z-index:\s*(\d+)/.exec(bar)?.[1]);
    const railZ = Number(/z-index:\s*(\d+)/.exec(rail)?.[1]);
    expect(barZ).toBeGreaterThan(railZ);
  });

  it('sizes the phone split against the visual viewport once the stage is tracked', () => {
    const tracked = ruleBody('.is-playing-full-viewport.has-agent-panel.is-viewport-tracked');
    expect(tracked).toMatch(/height:\s*var\(--agent-visual-height,\s*100dvh\)/);
    expect(tracked).toMatch(/transform:\s*translateY\(var\(--agent-visual-offset,\s*0px\)\)/);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*760px\)[\s\S]*?\.has-agent-panel\.is-viewport-tracked\s*\{[\s\S]*?--agent-inset-bottom:\s*var\(--agent-visual-inset-bottom,\s*55dvh\)/,
    );
  });
});
