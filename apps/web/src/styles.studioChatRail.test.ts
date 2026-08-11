import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

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
});
