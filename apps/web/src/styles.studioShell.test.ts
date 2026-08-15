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

  /**
   * The Details sheet's `.studio-rail-backdrop` spans the full stage, including the
   * strip. Without a z-index above it, the strip's own Play/Code/Share buttons sit
   * visibly on top of the backdrop but the backdrop is what actually receives the
   * tap — every one of those taps silently closes the sheet back to the thread tab
   * instead of doing what the visible control promised. Same shape, same z-index, as
   * the chat-rail sheet's `.studio-strip` fix (styles.studioChatRail.test.ts).
   */
  it('keeps the strip reachable while the Details sheet is open', () => {
    expect(css).toMatch(/\.app:has\(\.studio-rail-backdrop\) \.studio-strip\s*\{[^}]*z-index:\s*1200/s);
  });

  /**
   * The phone games-shelf drawer's backdrop (z-index 1100) spans the full viewport,
   * including the strip the hamburger sits in above the drawer's own ~90vw width.
   * Without this the global nav is unreachable — tapping the visibly-drawn hamburger
   * just closes the drawer instead — for as long as the shelf stays open. Same
   * "sheet is modal over the stage, not over the site's navigation" rule the
   * chat-rail sheet already gets for `.app-header`, just missing this one backdrop.
   */
  it('keeps the global nav reachable while the games shelf drawer is open', () => {
    expect(css).toMatch(/\.app:has\(\.studio-shelf-backdrop\) \.app-header\s*\{[^}]*z-index:\s*1200/s);
  });
});
