import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function loadCss(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

// "Defined once" means once across the split code surface CSS files.
const css = [
  loadCss('../../styles.css'),
  loadCss('./editor-controller.css'),
  loadCss('./code-surface.css'),
  loadCss('./code-surface-agent.css'),
  loadCss('./code-surface-explorer.css'),
  loadCss('./code-surface-editor.css'),
  loadCss('./code-surface-statusbar.css'),
  loadCss('./code-actions-menu.css'),
].join('\n');

describe('Code surface file tree CSS', () => {
  it('defines the tree toolbar and confirm dialog once, not inside a copy of the shell', () => {
    expect(css.match(/\.code-surface-tree-toolbar \{/g)?.length).toBe(1);
    expect(css.match(/\.code-surface-tree-dialog \{/g)?.length).toBe(1);
    expect(css).toMatch(/\.code-surface-tree-toolbar \{[\s\S]*?display:\s*flex/);
  });

  it('keeps row actions visible on the phone sheet', () => {
    expect(css).toMatch(/@media \(max-width: 1099px\)[\s\S]*?\.code-surface-tree-actions \{\s*opacity: 1;/);
  });

  it('lifts the confirm veil above the phone chat sheet', () => {
    expect(css).toMatch(/\.code-surface-tree-backdrop \{[\s\S]*?position:\s*fixed/);
    expect(css).toMatch(/\.code-surface-tree-backdrop \{[\s\S]*?z-index:\s*1300/);
  });
});
