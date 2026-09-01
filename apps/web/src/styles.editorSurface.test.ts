import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

// The edit-overlay dock rule now lives in the stage file.
const css = [read('./styles.css'), read('./surfaces/studio/studio-stage.css')].join('\n');

function declarations(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing ${selector} rule`).toBeGreaterThan(-1);
  const end = css.indexOf('}', start);
  expect(end, `unclosed ${selector} rule`).toBeGreaterThan(start);
  return css.slice(start, end);
}
describe('layered editor surface CSS contract', () => {
  it('pins the stacked board posture and active-layer interaction', () => {
    expect(declarations('.editor-layer-stack')).toMatch(/display:\s*grid/);
    expect(declarations('.editor-layer-board')).toMatch(/grid-area:\s*1 \/ 1/);
    expect(declarations('.editor-layer-board.is-muted')).toMatch(/pointer-events:\s*none/);
    expect(declarations('.editor-layer-board.is-active')).toMatch(/z-index:\s*2/);
  });

  it('keeps the picker readable beside the stacked board', () => {
    expect(declarations('.editor-layer-picker')).toMatch(/display:\s*flex/);
    expect(declarations('.editor-layer-picker-item.is-active')).toMatch(/border-color:/);
    expect(declarations('.editor-layered-remix-grid')).toMatch(/grid-template-columns:/);
  });

  it('pins the edit overlay dock posture used by layered definitions', () => {
    const dock = ".studio-edit-overlay:not(.studio-code-overlay)[data-surface='docked']";
    expect(css).not.toContain(':has(.editor-board-col)');
    expect(declarations(dock)).toMatch(/inset:\s*0 0 0 auto/);
    expect(declarations(dock)).toMatch(/width:\s*min\(360px, 100%\)/);
  });
});
