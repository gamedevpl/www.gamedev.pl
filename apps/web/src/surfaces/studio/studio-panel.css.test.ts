import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./studio-panel.css', import.meta.url)), 'utf8');

describe('Studio removal notice', () => {
  it('floats below the top navigation without spanning the workspace', () => {
    const start = css.indexOf('.studio-abandon-notice {');
    const end = css.indexOf('}', start);
    const rule = css.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/top:\s*calc\(max\(12px, env\(safe-area-inset-top\)\) \+ 69px\)/);
    expect(rule).toMatch(/right:\s*24px/);
    expect(rule).toMatch(/left:\s*auto/);
    expect(rule).toMatch(/max-width:\s*560px/);
    expect(rule).toMatch(/box-shadow:/);
  });

  it('uses safe mobile spacing below the compact top navigation', () => {
    expect(css).toMatch(
      /@media \(max-width: 768px\)\s*{\s*\.studio-abandon-notice\s*{[^}]*top:\s*calc\(max\(8px, env\(safe-area-inset-top\)\) \+ 65px\)/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 768px\)\s*{\s*\.studio-abandon-notice\s*{[^}]*left:\s*12px;[^}]*width:\s*auto;/s,
    );
  });
});
