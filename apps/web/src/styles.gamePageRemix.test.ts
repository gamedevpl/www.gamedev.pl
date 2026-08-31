import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');
const remixEditorStageCss = readFileSync(fileURLToPath(new URL('./remix-editor-stage.css', import.meta.url)), 'utf8');
const phoneStart = css.lastIndexOf('@media (max-width: 600px)');
const phoneEnd = css.indexOf(
  '/* ---------------------------------------------------------------------------',
  phoneStart,
);
const phoneCss = css.slice(phoneStart, phoneEnd);

function phoneRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`).exec(phoneCss);
  expect(match, `no phone ${selector} rule in styles.css`).not.toBeNull();
  return match![1]!;
}

describe('game-page Remix entry on phones', () => {
  it('uses a full-screen, opaque composer instead of a bottom sheet', () => {
    const backdrop = phoneRule('.game-page-remix-backdrop');
    const dialog = phoneRule('.game-page-remix-dialog');

    expect(backdrop).toMatch(/background:\s*var\(--bg\)/);
    expect(backdrop).toMatch(/backdrop-filter:\s*none/);
    expect(backdrop).toMatch(/bottom:\s*auto/);
    expect(backdrop).toMatch(/height:\s*100vh/);
    expect(backdrop).toMatch(/height:\s*100dvh/);
    expect(dialog).toMatch(/height:\s*100%/);
    expect(dialog).toMatch(/max-height:\s*none/);
    expect(dialog).toMatch(/border:\s*0/);
    expect(dialog).toMatch(/border-radius:\s*0/);
  });

  it('keeps the composer and actions usable with safe areas and a shrinking viewport', () => {
    const dialog = phoneRule('.game-page-remix-dialog');
    const form = phoneRule('.game-page-remix-form');
    const actions = phoneRule('.game-page-remix-form-actions');

    expect(dialog).toMatch(/safe-area-inset-top/);
    expect(dialog).toMatch(/safe-area-inset-bottom/);
    expect(form).toMatch(/grid-template-rows:\s*auto minmax\(8rem,\s*1fr\) auto/);
    expect(form).toMatch(/min-height:\s*0/);
    expect(actions).toMatch(/grid-template-columns:\s*minmax\(0,\s*0\.65fr\) minmax\(0,\s*1\.55fr\)/);
    expect(phoneRule('.game-page-remix-form-actions > button')).toMatch(/min-height:\s*52px/);
    expect(phoneRule(".game-page-remix-form-actions > button[type='submit']")).toMatch(/white-space:\s*nowrap/);
  });

  it('hands sizing to the visual viewport when the keyboard changes it', () => {
    const tracked = phoneRule('.game-page-remix-backdrop.is-viewport-tracked');

    expect(tracked).toMatch(/height:\s*var\(--remix-entry-viewport-height,\s*100dvh\)/);
    expect(tracked).toMatch(/transform:\s*translateY\(var\(--remix-entry-viewport-offset,\s*0px\)\)/);
  });
});

describe('Remix editor Play focus', () => {
  it('fits the path preview into the PiP and removes editing controls', () => {
    expect(remixEditorStageCss).toMatch(
      /\.remix-editor-stage\.is-focus-play \.remix-painter-properties,[\s\S]*\.editor-path-help\s*\{\s*display:\s*none;/,
    );
    expect(remixEditorStageCss).toMatch(
      /\.remix-editor-stage\.is-focus-play \.editor-path-wrap\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s,
    );
    expect(remixEditorStageCss).toMatch(
      /\.remix-editor-stage\.is-focus-play \.editor-path-viewport\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s,
    );
    expect(remixEditorStageCss).toMatch(
      /\.remix-editor-stage\.is-focus-play \.editor-path\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*min-width:\s*0;[^}]*min-height:\s*0;/s,
    );
  });
});

describe('Editor path touch interaction', () => {
  it('lets oversized surfaces scroll while point handles remain draggable', () => {
    expect(css).toMatch(/\.editor-path\s*\{[^}]*touch-action:\s*pan-x pan-y/s);
    expect(css).toMatch(/\.editor-path-point\s*\{[^}]*touch-action:\s*none/s);
    expect(css).toMatch(/\.editor-path-point-hit\s*\{[^}]*fill:\s*transparent[^}]*pointer-events:\s*all/s);
    expect(css).toMatch(/\.editor-path-point-dot\s*\{[^}]*pointer-events:\s*none/s);
  });
});
