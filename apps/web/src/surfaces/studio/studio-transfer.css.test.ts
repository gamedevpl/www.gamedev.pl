import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const globalCss = readFileSync(fileURLToPath(new URL('../../styles.css', import.meta.url)), 'utf8');

// The compact shelf is an 80px rail, too narrow for this.
describe('transfer inbox on a compact shelf', () => {
  it('hides with the game list rather than squeezing into the rail', () => {
    const compactHide = globalCss.match(
      /\.studio-layout\.is-compact-shelf:not\(\.is-shelf-open\) \.studio-shelf-list,[\s\S]{0,400}?\{\s*display: none;/,
    );
    expect(compactHide).not.toBeNull();
    expect(compactHide?.[0]).toContain('.studio-transfer-inbox');
  });
});
