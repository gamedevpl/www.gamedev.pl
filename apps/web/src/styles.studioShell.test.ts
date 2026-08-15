import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

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

  it('gives the complete phone action set a full-width row', () => {
    expect(css).toMatch(
      /@media \(max-width: 800px\)[\s\S]*?\.app:has\(\.studio-layout\.is-game-open\) \.studio-strip\s*\{[\s\S]*?flex-wrap:\s*wrap;/,
    );
    expect(css).toMatch(
      /\.app:has\(\.studio-layout\.is-game-open\) \.studio-strip-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?width:\s*100%;/,
    );
    expect(css).toMatch(
      /\.app:has\(\.studio-layout\.is-game-open\) \.studio-strip-actions \.studio-head-action\.is-primary\s*\{[\s\S]*?grid-column:\s*span 2;/,
    );
  });

  // The Details backdrop covers the strip — buttons must stay above it.
  it('keeps the strip reachable while the Details sheet is open', () => {
    expect(css).toMatch(/\.app:has\(\.studio-rail-backdrop\) \.studio-strip\s*\{[^}]*z-index:\s*1200/s);
  });

  // Same shape: the shelf drawer's backdrop covers the hamburger beside it.
  it('keeps the global nav reachable while the games shelf drawer is open', () => {
    expect(css).toMatch(/\.app:has\(\.studio-shelf-backdrop\) \.app-header\s*\{[^}]*z-index:\s*1200/s);
  });
});
