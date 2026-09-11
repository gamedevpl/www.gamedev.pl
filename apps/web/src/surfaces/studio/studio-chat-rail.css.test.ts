import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

// The `.app-header` claim stays global; that header loads eagerly.
const css = [read('./studio-chat-rail.css'), read('../../styles.css')].join('\n');

function declarations(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing ${selector} rule`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, `unclosed ${selector} rule`).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe('Studio chat rail header', () => {
  it('keeps both actions in one separated flex row', () => {
    expect(declarations('.studio-chat-rail-head-actions')).toMatch(/display:\s*inline-flex/);
    expect(declarations('.studio-chat-rail-head-actions')).toMatch(/gap:\s*6px/);
    expect(declarations('.studio-chat-rail-head-action')).toMatch(/position:\s*relative/);
    expect(declarations('.studio-chat-rail-head-action')).toMatch(/width:\s*36px/);
    expect(declarations('.studio-chat-rail-head-action')).toMatch(/height:\s*36px/);
  });

  it('reveals localized tooltips on hover and keyboard focus', () => {
    expect(declarations('.studio-chat-rail-head-action::after')).toMatch(/content:\s*attr\(data-tooltip\)/);
    expect(css).toMatch(
      /\.studio-chat-rail-head-action:hover::after,\s*\.studio-chat-rail-head-action:focus-visible::after\s*{[^}]*opacity:\s*1[^}]*visibility:\s*visible/s,
    );
  });

  it('gives the phone grab a full-width drag target', () => {
    expect(css).toMatch(
      /\.studio-chat-rail\.is-sheet \.studio-chat-rail-grab\s*\{[^}]*width:\s*100%[^}]*touch-action:\s*none/s,
    );
    expect(css).toMatch(/\.studio-chat-rail\.is-sheet\.is-dragging\s*\{[^}]*--studio-chat-rail-drag-height/s);
  });

  it('gives peek a height that fits its mandatory chrome', () => {
    expect(declarations('.studio-chat-rail.is-peek')).toMatch(
      /max-height:\s*none[^}]*height:\s*var\(--studio-chat-rail-peek-height,\s*124px\)/s,
    );
  });

  it('keeps the builder choice modal above the phone chat sheet', () => {
    expect(declarations('.builder-choice-modal-backdrop')).toMatch(/z-index:\s*1300/);
    expect(css).toMatch(/\.studio-chat-rail\.is-sheet\s*\{[^}]*z-index:\s*1100/s);
  });

  it('keeps navigation above the phone sheet and its backdrop', () => {
    expect(declarations('.studio-chat-rail-backdrop')).toMatch(/top:\s*var\(--studio-chat-rail-top-inset,\s*0px\)/);
    expect(css).toMatch(
      /\.app:has\(\.studio-chat-rail\.is-sheet:not\(\.is-collapsed\)\) \.app-header\s*\{[^}]*z-index:\s*1200/s,
    );
  });

  it('keeps the half-open Studio controls reachable', () => {
    expect(css).toMatch(
      /\.app:has\(\.studio-chat-rail\.is-sheet\.is-half:not\(\.is-collapsed\)\) \.studio-strip\s*\{[^}]*z-index:\s*1200/s,
    );
  });

  it('keeps a covered sheet from painting over the games drawer', () => {
    expect(css).toMatch(
      /\.studio-chat-rail\.is-sheet\.is-collapsed\s*\{[\s\S]*?visibility:\s*hidden[\s\S]*?pointer-events:\s*none/s,
    );
  });

  it('makes chat full screen fill the work area below the header', () => {
    expect(declarations('.studio-chat-rail.is-full')).toMatch(
      /top:\s*max\(var\(--studio-chat-rail-top-inset,\s*0px\),\s*env\(safe-area-inset-top,\s*0px\)\)/,
    );
    expect(declarations('.studio-chat-rail.is-full')).toMatch(/height:\s*auto/);
    expect(declarations('.studio-chat-rail.is-full')).toMatch(/border-radius:\s*0/);
  });

  // Guards against a stale JS inset landing under the PWA notch.
  it('floors the full-screen sheet at the safe area even if the JS inset is stale', () => {
    expect(declarations('.studio-chat-rail.is-full')).toMatch(/env\(safe-area-inset-top,\s*0px\)/);
  });

  it('lets the transcript take vertical pans inside the sheet', () => {
    expect(declarations('.studio-chat-rail-body')).toMatch(/touch-action:\s*pan-y/);
    expect(declarations('.studio-chat-rail-body .studio-thread-scroll')).toMatch(/touch-action:\s*pan-y/);
  });
});
