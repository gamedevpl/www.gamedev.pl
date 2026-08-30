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
