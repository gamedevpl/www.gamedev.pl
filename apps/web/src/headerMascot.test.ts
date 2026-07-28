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

  it('still lets prefers-reduced-motion win over both', () => {
    const css = read('styles.css');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    // `!important` is what beats the hover rule — a plain `animation: none` there
    // loses to it on specificity and the hop would survive the media query.
    expect(reduced).toMatch(/\.mascot \.mascot__body-group,[\s\S]{0,200}?animation: none !important/);
  });
});
