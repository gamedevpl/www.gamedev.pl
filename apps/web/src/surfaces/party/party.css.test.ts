import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const partyCss = readFileSync(new URL('./party.css', import.meta.url), 'utf8');

// Regression: .party-error alone loses to .error at equal specificity.
describe('party error margin', () => {
  it('overrides .error with a selector specific enough to survive any load order', () => {
    expect(partyCss).toMatch(/\.error\.party-error \{[\s\S]*?margin: 12px auto;[\s\S]*?\}/);
    expect(partyCss).not.toMatch(/^\.party-error \{/m);
  });
});

// Regression: the shared screen showed game chrome around a boxed canvas.
describe('party stage fills the shared screen', () => {
  const stageSource = readFileSync(new URL('./PartyStage.tsx', import.meta.url), 'utf8');

  it('embeds the game so its own chrome is hidden', () => {
    expect(stageSource).toMatch(/<PublishedGameFrame[\s\S]*?\n\s+embed\n[\s\S]*?\/>/);
  });

  it('gives the playing column the full stage width', () => {
    expect(partyCss).toMatch(/\.party-playing \{[\s\S]*?width: 100%;[\s\S]*?\}/);
  });

  it('lets the frame take the height left below the slot strip', () => {
    expect(partyCss).toMatch(/\.is-playing-full-viewport \.party-playing \.game-frame \{[\s\S]*?flex: 1 1 auto;/);
  });
});
