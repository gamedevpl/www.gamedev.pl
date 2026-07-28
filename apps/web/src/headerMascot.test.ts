import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The header mark is the one mascot every visitor sees, on every page. It shipped
 * frozen — `staticPose` on the nav instance keys off every `:not(.mascot--static)`
 * animation in the stylesheet at once — so the site's mascot was the only one that
 * never breathed or blinked.
 *
 * Both halves of that are asserted from source rather than from a render: the prop is
 * a one-word regression that a rendered-DOM test would have to reach through
 * AuthContext and i18n to catch, and the hover rule has no DOM footprint at all.
 */
const read = (name: string) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');

describe('the header mascot is alive', () => {
  it('does not freeze the nav mark', () => {
    const navHeader = read('NavHeader.tsx');
    const logoMascot = navHeader.match(/<Mascot[^>]*mascot--logo[^>]*\/>/s);
    expect(logoMascot).not.toBeNull();
    expect(logoMascot![0]).not.toMatch(/staticPose/);
  });

  it('promotes the idle breath to a hop while the logo is hovered', () => {
    expect(read('styles.css')).toMatch(
      /\.logo:hover \.mascot--logo:not\(\.mascot--static\) \.mascot__body-group \{\s*animation: mascot-bounce/,
    );
  });

  it('gives the mark its own idle, because the shared one is invisible at 35px', () => {
    // 35px wide against a 70-unit viewBox is a 0.5 scale, so the shared keyframes
    // came out as ~1.5px of travel over 2.8s — running, but not visible. It was
    // reported as "not animated" twice while animating the whole time.
    const css = read('styles.css');
    expect(css).toMatch(
      /\.mascot\.mascot--logo:not\(\.mascot--static\)\.mascot--idle \.mascot__body-group \{\s*animation: mascot-logo-idle/,
    );
    const frames = css.slice(css.indexOf('@keyframes mascot-logo-idle'));
    // The hop is what makes it legible: an event the eye catches, not a drift.
    expect(frames).toMatch(/translateY\(-9px\)/);
  });

  it('keeps the hover hop winning over that idle', () => {
    // Both selectors carry the same weight once `:hover` is counted, so the only
    // thing deciding it is source order. Move the hover rule above the idle rule and
    // hovering the logo silently stops doing anything.
    const css = read('styles.css');
    const idleAt = css.indexOf('.mascot.mascot--logo:not(.mascot--static).mascot--idle .mascot__body-group');
    const hoverAt = css.indexOf('.logo:hover .mascot--logo:not(.mascot--static) .mascot__body-group');
    expect(idleAt).toBeGreaterThan(-1);
    expect(hoverAt).toBeGreaterThan(idleAt);
  });

  it('still lets prefers-reduced-motion win over both', () => {
    const css = read('styles.css');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    // `!important` is what beats the hover rule — a plain `animation: none` there
    // loses to it on specificity and the hop would survive the media query.
    expect(reduced).toMatch(/\.mascot \.mascot__body-group,[\s\S]{0,200}?animation: none !important/);
  });
});
