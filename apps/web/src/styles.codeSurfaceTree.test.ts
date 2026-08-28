import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

describe('Code surface file tree CSS', () => {
  it('defines the tree toolbar and confirm dialog once, not inside a copy of the shell', () => {
    expect(css.match(/\.code-surface-tree-toolbar \{/g)?.length).toBe(1);
    expect(css.match(/\.code-surface-tree-dialog \{/g)?.length).toBe(1);
    expect(css).toMatch(/\.code-surface-tree-toolbar \{[\s\S]*?display:\s*flex/);
  });

  it('keeps row actions visible on the phone sheet', () => {
    expect(css).toMatch(/@media \(max-width: 1099px\)[\s\S]*?\.code-surface-tree-actions \{\s*opacity: 1;/);
  });
});
