import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const partyCss = readFileSync(new URL('./party.css', import.meta.url), 'utf8');

/**
 * Regression: PartyPage renders `className="error party-error"`. A plain
 * `.party-error` selector has the same specificity as the generic `.error`
 * rule in styles.css, so which one wins depended on stylesheet load order —
 * broken once party.css started loading ahead of styles.css in the bundle.
 * `.error.party-error` always wins regardless of order.
 */
describe('party error margin', () => {
  it('overrides .error with a selector specific enough to survive any load order', () => {
    expect(partyCss).toMatch(/\.error\.party-error \{[\s\S]*?margin: 12px auto;[\s\S]*?\}/);
    expect(partyCss).not.toMatch(/^\.party-error \{/m);
  });
});
