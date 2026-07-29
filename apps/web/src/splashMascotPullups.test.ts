import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Splash pull-ups are a wiring + CSS gag: the prop lives on ClosedBetaSplash and
 * the climb distances live in keyframes. Asserted from source so we do not have
 * to mount AuthContext just to prove a boolean made it onto the button.
 */
const read = (name: string) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');

describe('the splash mascot does idle pull-ups', () => {
  it('opts the splash InteractiveMascot into pull-ups', () => {
    const splash = read('ClosedBetaSplash.tsx');
    const mascot = splash.match(/<InteractiveMascot[\s\S]*?\/>/);
    expect(mascot).not.toBeNull();
    expect(mascot![0]).toMatch(/doesPullUps/);
  });

  it('animates a climb then chin-ups against the card rim', () => {
    const css = read('styles.css');
    expect(css).toMatch(/\.mascot-interactive--pullups/);
    expect(css).toMatch(/@keyframes mascot-pullups-climb/);
    expect(css).toMatch(/@keyframes mascot-pullups-chin/);
    expect(css).toMatch(/--pullup-hang/);
    expect(css).toMatch(/--pullup-chin-lift/);
    // Body-only chin-ups — if hang-arms lived inside body-group this would float.
    expect(css).toMatch(
      /\.mascot-interactive--pullups \.mascot__body-group \{[\s\S]*?animation: mascot-pullups-chin/,
    );
  });

  it('lets the card rim show his hands', () => {
    const css = read('styles.css');
    const card = css.slice(css.indexOf('.beta-splash__card {'), css.indexOf('.beta-splash__logo {'));
    expect(card).toMatch(/overflow:\s*visible/);
    expect(card).toMatch(/position:\s*relative/);
  });

  it('still kills the session under prefers-reduced-motion', () => {
    const css = read('styles.css');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.mascot-interactive--pullups/);
  });
});
