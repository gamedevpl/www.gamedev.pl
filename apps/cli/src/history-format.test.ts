import { describe, expect, it } from 'vitest';
import stringWidth from 'string-width';
import type { HistoryVersion } from '@gamedevpl/contract';
import { stripTerminalControls } from './ansi.js';
import { formatHistoryLog, formatHistoryVersion } from './history-format.js';

const row: HistoryVersion = {
  version: 'v20261014T083417049Z-597aa5561aa5',
  createdAt: '2026-10-14T08:34:17.049Z',
  jobId: 42,
  sourceFiles: ['game.ts'],
  deliveryMode: 'preview',
  verdict: 'passed',
  backend: 'self',
  model: 'test-model',
  summary:
    'Rails are over 50% narrower, with dark webs and polished steel heads.\n\nWebGL and Canvas 2D checks passed; preview submitted.',
};

describe('readable history output', () => {
  it('keeps paragraphs, indents wrapped summaries and separates complete version blocks', () => {
    const output = formatHistoryLog([row, { ...row, version: 'v-previous', summary: undefined }], { columns: 60 });
    expect(output).toContain(`version ${row.version}\nDate:    `);
    expect(output).toContain('Status:  preview / passed\nBackend: self\nModel:   test-model\n\n    Rails');
    expect(output).toContain('\n\n    WebGL and Canvas');
    expect(output).toContain('\n\nversion v-previous\n');
    expect(output).toContain('    (no change summary)');
    expect(output).not.toContain('T08:34:17.049Z');
    expect(output).not.toContain('\u001b');
    expect(output.split('\n').every((line) => stringWidth(line) <= 60)).toBe(true);
    expect(formatHistoryLog([])).toBe('No delivered versions yet.');
  });

  it.each([24, 40, 80])('fits Unicode and long words in %i columns, with or without color', (columns) => {
    const input = { ...row, summary: `Zmiany torów 🚂 世界 ${'x'.repeat(150)}` };
    for (const oneline of [false, true]) {
      const plain = formatHistoryVersion(input, { columns, oneline });
      const colored = formatHistoryVersion(input, { columns, oneline, color: true });
      expect(plain.split('\n').every((line) => stringWidth(line) <= columns)).toBe(true);
      expect(stripTerminalControls(colored)).toBe(plain);
      if (oneline) {
        expect(plain).not.toContain('\n');
        expect(plain).toMatch(/…$/);
      }
    }
  });

  it('removes untrusted terminal escapes before applying its own colors', () => {
    const output = formatHistoryVersion(
      {
        ...row,
        version: '\u001b[2Jversion\nforged',
        summary: '\u001b]52;c;clipboard\u0007Safe summary\u001b[31m',
        backend: 'self\nDate: forged',
      },
      { color: true },
    );
    expect(output).not.toContain('[2J');
    expect(output).not.toContain('clipboard');
    expect(output).not.toContain('\u0007');
    expect(output).not.toContain('\nDate: forged');
    expect(output).toContain('\u001b[33mversion versionforged\u001b[0m');
    expect(output).toContain('    Safe summary');
    expect(output).not.toContain('\u001b[31m');
  });
});
