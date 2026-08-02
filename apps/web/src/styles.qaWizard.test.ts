import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Comments are stripped up front so these assertions read declarations rather than
 * prose. The rules below are commented heavily, and a comment that *names* the thing
 * it is explaining — "not `inset: 0`", "below the 1000 tier" — otherwise satisfies or
 * defeats the very pattern meant to check the declaration underneath it.
 */
const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/**
 * The declarations of the first block whose selector list includes `selector` — the
 * desktop rule, before any media-query override. Matching the selector list rather than
 * an exact `selector {` is what finds `.install-prompt`, which shares its block with
 * `.app-update` and would otherwise resolve to a later override carrying no z-index.
 */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The selector must be a whole entry in the list: preceded by the start of a block
  // and followed either by the brace or by a comma and the rest of the group. Anchoring
  // both ends is what keeps `.qa-wizard` off `.qa-wizard-header` and `.modal-backdrop`
  // off `.sketch-modal-backdrop`.
  const pattern = new RegExp(`(?:^|[},])\\s*${escaped}\\s*(?:,[^{}]*)?\\{`, 'm');
  const match = pattern.exec(css);
  expect(match, `no ${selector} rule in styles.css`).not.toBeNull();
  const start = match!.index + match![0].length;
  const end = css.indexOf('}', start);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(start);
  return css.slice(start, end);
}

/** Places a new overlay against the rest of the stack rather than against a guess. */
function zIndexOf(selector: string): number {
  const match = /z-index:\s*(\d+)/.exec(rule(selector));
  expect(match, `${selector} declares no z-index`).not.toBeNull();
  return Number(match![1]);
}

describe('the creator confirm wizard as a full-screen overlay', () => {
  /**
   * Regression: the wizard shipped at `z-index: 90`.
   *
   * A full-screen overlay that loses the stacking contest is worse than no overlay —
   * the sticky app header painted over the wizard's own header, swallowing its step
   * label and the only exit control, and the fixed install/update banners covered the
   * footer navigation. These are the neighbours it has to outrank.
   */
  it('outranks the app chrome it covers', () => {
    const wizard = zIndexOf('.qa-wizard');

    expect(wizard).toBeGreaterThan(zIndexOf('.app-header'));
    expect(wizard).toBeGreaterThan(zIndexOf('.install-prompt'));
  });

  /**
   * ...but not the 1000 tier. Both portal to the body, so source order decides nothing
   * and only the z-index keeps a sign-in prompt — or a running game — on top of the
   * wizard instead of sealed behind it. The first fix for the bug above overshot to
   * 1200 and buried the auth modal, which is the failure this pins down.
   */
  it('stays under the modal backdrop, so a sign-in prompt lands over it', () => {
    const wizard = zIndexOf('.qa-wizard');

    expect(wizard).toBeLessThan(zIndexOf('.modal-backdrop'));
    expect(wizard).toBeLessThan(zIndexOf('.howto-backdrop'));
  });

  /**
   * index.html sets viewport-fit=cover for the game theater, which makes the insets
   * nonzero on a notched phone. Covering .app-header means inheriting the reason it
   * pays the top inset: otherwise the step text and the exit button render under the
   * status bar, where taps never reach them.
   */
  it('pays both safe-area insets, because it replaces the chrome that used to', () => {
    expect(rule('.qa-wizard-header')).toMatch(/padding-top:\s*max\(12px, env\(safe-area-inset-top\)\)/);
    expect(rule('.qa-wizard-footer')).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  /**
   * Two stages are a text field, so the keyboard is up for much of this flow. A
   * bottom-anchored `inset: 0` box resolves against iOS's large viewport and puts the
   * footer — Back, Skip, Next — behind Safari's own bar. dvh tracks what is visible,
   * with the vh line kept underneath it for browsers that lack dvh.
   */
  it('is sized against the visible viewport, not the large one', () => {
    const wizard = rule('.qa-wizard');

    expect(wizard).not.toMatch(/inset:\s*0/);
    expect(wizard).toMatch(/height:\s*100vh/);
    expect(wizard).toMatch(/height:\s*100dvh/);
  });
});
