import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

// The overlay moved; the editor panel stays global.
const css = [read('./styles.css'), read('./surfaces/studio/studio-stage.css')].join('\n');

function declarations(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing ${selector} rule`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, `unclosed ${selector} rule`).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe('Studio editor layout', () => {
  it('keeps the editor overlay independently scrollable', () => {
    expect(declarations('.studio-edit-overlay')).toMatch(/min-height:\s*0/);
    expect(declarations('.studio-edit-overlay')).toMatch(/overflow:\s*auto/);
    expect(declarations('.studio-edit-overlay')).toMatch(/overscroll-behavior:\s*contain/);
  });

  it('keeps long editor content scrollable without losing its toolbar', () => {
    expect(declarations('.editor-panel')).toMatch(/min-height:\s*0/);
    expect(declarations('.editor-panel')).toMatch(/overflow-y:\s*auto/);
    expect(declarations('.editor-panel-head')).toMatch(/position:\s*sticky/);
  });
});
