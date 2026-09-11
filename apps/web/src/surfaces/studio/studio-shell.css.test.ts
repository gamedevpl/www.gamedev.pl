import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

const css = read('./studio-shell.css');
const railCss = read('./studio-head-rail.css');
// Two claims target the eagerly-loaded site header, so they stay global.
const globalCss = read('../../styles.css');

/**
 * The studio shell claim is keyed off `:has(...)`, and the loading flash was a missing
 * second key. A unit suite cannot evaluate computed layout, but it can refuse a revert
 * that drops `.studio-shell-pending` from the selectors the browser e2e exercises.
 */
describe('studio shell claim selectors', () => {
  it('claims the window for both an open game and a pending shelf fetch', () => {
    expect(css).toMatch(/\.app:has\(:is\(\.studio-layout\.is-game-open,\s*\.studio-shell-pending\)\)\s*\{/);
    expect(css).toMatch(
      /\.app:has\(:is\(\.studio-layout\.is-game-open,\s*\.studio-shell-pending\)\)\s*\.site-footer\s*\{/,
    );
    expect(css).toMatch(
      /\.app:has\(:is\(\.studio-layout\.is-game-open,\s*\.studio-shell-pending\)\)\s*\.studio-panel-header\s*\{/,
    );
    expect(css).toMatch(
      /\.app:has\(:is\(\.studio-layout\.is-game-open,\s*\.studio-shell-pending\)\)\s*\.install-prompt/,
    );
  });

  it('keeps the whole phone strip — folder, title, actions — on one row', () => {
    expect(css).toMatch(
      /@media \(max-width: 800px\), \(max-height: 500px\)[\s\S]*?\.app:has\(\.studio-layout\.is-game-open\) \.studio-strip\s*\{[\s\S]*?flex-wrap:\s*nowrap;/,
    );
    // Inline after the title, not forced onto its own full-width line.
    expect(css).toMatch(
      /\.app:has\(\.studio-layout\.is-game-open\) \.studio-strip-actions\s*\{[\s\S]*?flex:\s*0 0 auto;/,
    );
    // Folder/Code/Play/⋯ stay fixed size; only the title shrinks.
    expect(css).toMatch(
      /\.app:has\(\.studio-layout\.is-game-open\) \.studio-strip-actions > \*,[\s\S]*?flex:\s*0 0 auto;/,
    );
  });

  it('hides the redundant global topbar once a game is open on a phone', () => {
    expect(globalCss).toMatch(
      /@media \(max-width: 800px\), \(max-height: 500px\)[\s\S]*?\.app:has\(\.studio-layout\.is-game-open\) \.app-header\s*\{[\s\S]*?display:\s*none;/,
    );
  });

  // The Details backdrop covers the strip — buttons must stay above it.
  it('keeps the strip reachable while the Details sheet is open', () => {
    expect(railCss).toMatch(/\.app:has\(\.studio-rail-backdrop\) \.studio-strip\s*\{[^}]*z-index:\s*1200/s);
  });

  // Same shape: the shelf drawer's backdrop covers the hamburger beside it.
  it('keeps the global nav reachable while the games shelf drawer is open', () => {
    expect(globalCss).toMatch(/\.app:has\(\.studio-shelf-backdrop\) \.app-header\s*\{[^}]*z-index:\s*1200/s);
  });
});
