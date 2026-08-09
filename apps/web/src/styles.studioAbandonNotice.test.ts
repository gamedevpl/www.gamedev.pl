import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

describe('Studio removal notice', () => {
  it('floats like the app update toast without spanning the workspace', () => {
    const start = css.indexOf('.studio-abandon-notice {');
    const end = css.indexOf('}', start);
    const rule = css.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/bottom:\s*max\(12px, env\(safe-area-inset-bottom\)\)/);
    expect(rule).toMatch(/max-width:\s*560px/);
    expect(rule).toMatch(/box-shadow:/);
  });

  it('stacks above another bottom toast', () => {
    expect(css).toMatch(/\.app:has\(:is\(\.install-prompt, \.app-update\)\) \.studio-abandon-notice\s*{[^}]*bottom:/s);
  });
});
