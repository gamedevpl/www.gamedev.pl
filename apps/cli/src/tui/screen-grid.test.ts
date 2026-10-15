import { expect, it } from 'vitest';
import { cells, columnText, frameOf, highlight, osc52, OSC52_LIMIT, SELECTED, wordAt } from './screen-grid.js';

it('reads the newest frame from a log-update write and ignores short writes', () => {
  const frame = frameOf('\u001b[2K\u001b[1A\u001b[2K\u001b[G\u001b[1mtop\u001b[22m\nmiddle\nbottom\n', 3);
  expect(frame?.plain).toEqual(['top', 'middle', 'bottom']);
  expect(frame?.raw[0]).toBe('\u001b[1mtop\u001b[22m');
  expect(frameOf('static\ntop\nbottom', 2)?.plain).toEqual(['top', 'bottom']);
  expect(frameOf('\u001b[?1002h', 3)).toBeNull();
});

it('maps wide characters to two columns and Polish letters to one', () => {
  expect(cells('aż😀b')).toEqual(['a', 'ż', '😀', '', 'b']);
  expect(columnText('aż😀b', 2, 4)).toBe('ż😀');
  expect(columnText('zażółć', 3, 99)).toBe('żółć');
});

it('finds words, paths and URLs under a column', () => {
  expect(wordAt('open https://www.gamedev.pl/games now', 10)).toEqual([6, 33]);
  expect(wordAt('edit src/tui/app.tsx', 8)).toEqual([6, 20]);
  expect(wordAt('a  b', 2)).toBeNull();
});

it('encodes OSC 52, wraps it for tmux and refuses oversized selections', () => {
  expect(osc52('zażółć', false)).toBe(`\u001b]52;c;${Buffer.from('zażółć').toString('base64')}\u0007`);
  expect(osc52('x', true)).toBe('\u001bPtmux;\u001b\u001b]52;c;eA==\u0007\u001b\\');
  expect(osc52('x'.repeat(OSC52_LIMIT), false)).toBeNull();
});

it('highlights selections in soft gray, or inverse video without colour', () => {
  const frame = { raw: ['pick this'], plain: ['pick this'] };
  expect(highlight(frame, 1, 6, 9)).toBe(`\u001b[1;6H${SELECTED}this\u001b[0m`);
  expect(highlight(frame, 1, 6, 9, false)).toBe('\u001b[1;6H\u001b[0;7mthis\u001b[0m');
});
