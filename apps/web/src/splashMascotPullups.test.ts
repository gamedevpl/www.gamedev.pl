import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Splash pull-ups are a wiring + CSS gag: the prop lives on ClosedBetaSplash and
 * one timeline climbs / chins / lands the whole button. No hang face, no redrawn
 * limbs — he stays the normal logo mascot.
 */
const read = (name: string) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');

describe('the splash mascot does idle pull-ups', () => {
  it('opts the splash InteractiveMascot into pull-ups', () => {
    const game = read('SplashMascotGame.tsx');
    const mascot = game.match(/<InteractiveMascot[\s\S]*?\/>/);
    expect(mascot).not.toBeNull();
    expect(mascot![0]).toMatch(/doesPullUps/);
  });

  it('runs one climb-chin-land timeline on the button', () => {
    const css = read('styles.css');
    expect(css).toMatch(/\.mascot-interactive--pullups/);
    expect(css).toMatch(/@keyframes mascot-pullups/);
    expect(css).toMatch(/--pullup-hang/);
    expect(css).toMatch(/--pullup-chin/);
    // Whole-button motion — not a separate body-only chin track.
    expect(css).not.toMatch(/@keyframes mascot-pullups-chin/);
    expect(css).not.toMatch(/@keyframes mascot-pullups-climb/);
  });

  it('does not invent a hang face or redrawn limbs', () => {
    const mascot = read('Mascot.tsx');
    expect(mascot).toMatch(/PULLUP_SESSION_MS = 3_200/);
    expect(mascot).not.toMatch(/hanging\?:/);
    expect(mascot).not.toMatch(/HangMouthSeal/);
    expect(mascot).not.toMatch(/HangLimbCovers/);
    expect(mascot).not.toMatch(/HangArmStrokes/);
    expect(mascot).not.toMatch(/HangHands/);
    expect(mascot).not.toMatch(/FeetTogether/);
    expect(mascot).not.toMatch(/MOUTH_HANG/);
    const css = read('styles.css');
    expect(css).not.toMatch(/mascot-hang-mouth-seal/);
    expect(css).not.toMatch(/mascot__mouth-seal/);
  });

  it('lets the climb reach the card rim', () => {
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

  it('does not let the stage steal the Again click', () => {
    const src = read('SplashMascotGame.tsx');
    expect(src).toMatch(/if \(phase !== 'playing'\) return;/);
    expect(src).toMatch(/onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  });
});
