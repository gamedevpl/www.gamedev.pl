import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function loadCss(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

// The split code surface CSS spans styles.css plus these seven files.
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

// Regression: the Publish CTA once rendered as a bare native button.
function ruleFor(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `no ${selector} selector in the code surface CSS`).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  expect(open, `${selector} selector has no rule body`).toBeGreaterThan(start);
  const end = css.indexOf('}', open);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(open);
  return css.slice(open + 1, end);
}

describe('the Code surface Publish button', () => {
  it('is a filled turquoise CTA, not the unstyled native default', () => {
    const rule = ruleFor('.code-surface-deliver-btn');
    expect(rule).toMatch(/background:\s*var\(--turquoise\)/);
    expect(rule).toMatch(/color:\s*#08241d/);
  });

  it('has an explicit disabled treatment distinct from the enabled fill', () => {
    const rule = ruleFor('.code-surface-deliver-btn:disabled');
    expect(rule).toMatch(/color:\s*var\(--muted\)/);
  });

  it('no longer ships a separate Stage-it primary CTA — preview rebuilds on autosave', () => {
    expect(css).not.toMatch(/\.code-surface-stage-it/);
  });

  it('keeps Code navigation beside the global escape', () => {
    expect(ruleFor('.code-surface-head')).toMatch(/padding:\s*10px 14px/);
    expect(ruleFor('.studio-stage-layout:has(.studio-code-overlay) .code-surface-head')).toMatch(
      /padding-left:\s*180px/,
    );
    expect(ruleFor('.studio-stage-layout:has(.studio-code-overlay) .studio-fullbleed')).toMatch(/top:\s*10px/);
  });

  it('keeps Code full-bleed when params-only Edit docks beside the stage', () => {
    expect(ruleFor(".studio-edit-overlay:not(.studio-code-overlay)[data-surface='docked']")).toMatch(
      /width:\s*min\(360px,\s*100%\)/,
    );
    expect(css).not.toMatch(/\.studio-edit-overlay:not\(:has\(\.editor-board-col\)\)/);
  });

  it('gives the global escape its own row below desktop widths', () => {
    expect(css).toMatch(
      /@media \(max-width: 1099px\)[\s\S]*?\.studio-stage-layout:has\(\.studio-code-overlay\) \.code-surface-head \{\s*padding: 52px 14px 10px;/,
    );
    expect(css).toMatch(/\.code-surface-readonly-banner-compact \{\s*display: none;/);
    expect(css).toMatch(
      /@media \(max-width: 1099px\)[\s\S]*?\.code-surface-readonly-banner-full \{\s*display: none;[\s\S]*?\.code-surface-readonly-banner-compact \{\s*display: inline;/,
    );
  });

  it('keeps mobile file navigation on demand instead of rendering a tab rail', () => {
    expect(css).not.toMatch(/\.code-surface-file-select/);
    expect(css).toMatch(/\.code-surface-file-trigger-path[\s\S]*?text-overflow:\s*ellipsis/);
    expect(css).toMatch(
      /@media \(max-width: 1099px\)[\s\S]*?\.code-surface-file-backdrop \{\s*position: absolute;[\s\S]*?\.code-surface-file-sheet \{\s*position: relative;/,
    );
    expect(css).toMatch(/\.code-surface-file-option \{[\s\S]*?min-height: 44px/);
  });
});
