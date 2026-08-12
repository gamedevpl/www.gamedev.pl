import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The closed-beta splash is the entire site for anyone not signed in, and on an
 * iPhone SE it did not fit: the card wanted 678px of the ~553px Safari actually
 * leaves visible, so the terms and privacy links sat behind the toolbar.
 */
const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

describe('the beta splash fits a small phone', () => {
  it('measures the viewport as the part you can see', () => {
    const rule = css.slice(css.indexOf('.beta-splash,\n.beta-invite {'), css.indexOf('.beta-splash__card {'));
    // Both, in this order. iOS resolves 100vh to the large viewport, so dvh has to
    // come second and win; the vh line stays as the fallback for browsers without dvh.
    expect(rule).toMatch(/min-height: 100vh;[\s\S]*min-height: 100dvh;/);
  });

  it('compresses the card on a short screen', () => {
    const query = css.slice(css.indexOf('@media (max-height: 720px)'));
    expect(query.slice(0, 40)).toContain('@media (max-height: 720px)');
    // Keyed on height, not width — a phone in landscape is short too.
    for (const selector of [
      '.beta-splash__card',
      '.beta-splash__mascot .mascot',
      '.beta-splash__headline',
      '.splash-game__stage',
    ]) {
      expect(query).toContain(selector);
    }
  });

  it('hides pitch, not legal links, while a snack-catch round is on', () => {
    const query = css.slice(css.indexOf('@media (max-height: 720px)'));
    expect(query).toMatch(/\.beta-splash__card:has\(\.splash-game--playing\) \.beta-splash__headline/);
    expect(query).toMatch(/\.beta-splash__card:has\(\.splash-game--playing\) \.beta-splash__footer/);
    const legalBlock = query.slice(query.indexOf('.beta-splash__legal'), query.indexOf('.beta-splash__legal') + 120);
    expect(legalBlock).not.toMatch(/display:\s*none/);
  });

  it('centres the card without making an overflowing one unreachable', () => {
    const query = css.slice(css.indexOf('@media (max-height: 720px)'));
    // Comments here explain what NOT to use, so strip them before asserting absence.
    const splashStart = query.indexOf('.beta-splash,\n  .beta-invite {');
    const splash = query.slice(splashStart, query.indexOf('}', splashStart) + 1).replace(/\/\*[\s\S]*?\*\//g, '');
    // Centring a flex item that overflows puts its top edge where it cannot be
    // scrolled to. `safe center` expresses the intent but older Safari drops it and
    // falls back to plain `center` — the bug it was meant to avoid. Auto margins on
    // the card do the same job with no support caveat.
    expect(splash).toContain('align-items: flex-start');
    expect(splash).not.toContain('align-items: center');
    expect(splash).not.toContain('safe center');
    const card = query.slice(query.indexOf('.beta-splash__card,\n  .beta-invite__card {'));
    expect(card.slice(0, 200)).toMatch(/margin-top: auto;\s*margin-bottom: auto;/);
  });

  it('never hides the legal links to make room', () => {
    // Anything may be trimmed except the two links that have to be reachable on the
    // screen where signing in happens.
    const query = css.slice(css.indexOf('@media (max-height: 720px)'));
    const legalBlock = query.slice(query.indexOf('.beta-splash__legal'), query.indexOf('.beta-splash__legal') + 120);
    expect(legalBlock).not.toMatch(/display:\s*none/);
  });
});
