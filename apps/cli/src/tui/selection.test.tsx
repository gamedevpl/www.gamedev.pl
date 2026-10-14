import { expect, it, vi } from 'vitest';
import { screen } from './workspace-fixture.js';
import { ALT_OFF, ALT_ON } from './alt-screen.js';
import { MOUSE_OFF, MOUSE_ON } from './mouse.js';

const ROWS = 27;
const press = (x: number, y: number) => `\u001b[<0;${x};${y}M`;
const drag = (x: number, y: number) => `\u001b[<32;${x};${y}M`;
const release = (x: number, y: number) => `\u001b[<0;${x};${y}m`;

function workspace(lines: string[], options: { mouse?: boolean } = {}) {
  const copied: string[] = [];
  const view = screen(150, 28, 0, undefined, undefined, true, {
    ...options,
    clipboard: (text) => {
      copied.push(text);
      return true;
    },
  });
  void view.session.prompt();
  for (const line of lines) view.session.writeLine(line);
  const rows = () => view.frame().split('\n').slice(-ROWS);
  const find = (text: string, last = false) => {
    const all = rows();
    const y = last ? all.findLastIndex((row) => row.includes(text)) : all.findIndex((row) => row.includes(text));
    expect(y).toBeGreaterThanOrEqual(0);
    return { x: all[y]!.indexOf(text) + 1, y: y + 1, end: all[y]!.indexOf(text) + text.length, row: all[y]! };
  };
  return { view, copied, rows, find };
}

const messages = Array.from({ length: 60 }, (_, i) =>
  i === 55 ? `Wiadomość ${i} · ${'zażółć gęślą jaźń '.repeat(8)}` : `Message ${i}`,
);

it('copies a dragged range across wrapped Polish rows and highlights it until the next click', async () => {
  const { view, copied, find } = workspace(messages);
  await view.press('draft stays');
  const from = find('Message 54');
  const to = find('Message 56');
  const wrapped = find('Wiadomość 55');
  const continued = view.frame().split('\n').slice(-ROWS)[wrapped.y]!;
  await view.press(press(from.x, from.y) + drag(from.x + 3, from.y + 1) + drag(to.end, to.y) + release(to.end, to.y));
  expect(copied).toEqual([
    [
      'Message 54',
      wrapped.row.slice(0, 106).trimEnd(),
      continued.slice(0, 106).trimEnd(),
      to.row.slice(0, to.end).trimEnd(),
    ].join('\n'),
  ]);
  expect(copied[0]).toContain('zażółć gęślą jaźń');
  expect(copied[0]).not.toContain('│');
  expect(view.terminalOutput()).toContain('\u001b[0;7mMessage 54\u001b[0m');
  expect(view.frame()).toContain(`Copied ${[...copied[0]!].length} characters`);
  expect(view.session.get().draft).toBe('draft stays');
  const before = view.terminalOutput().length;
  await view.press(press(from.x, from.y) + release(from.x, from.y));
  expect(view.terminalOutput().slice(before)).toContain('\u001b[K');
  expect(copied).toHaveLength(1);
});

it('keeps a chat selection inside the conversation column when the pointer crosses into the sidebar', async () => {
  const { view, copied, find } = workspace(messages);
  const from = find('Message 57');
  const to = find('Message 58');
  await view.press(press(from.x, from.y) + drag(140, to.y) + release(140, to.y));
  expect(copied).toEqual(['Message 57\n       Message 58']);
  const title = find('WORKSPACE');
  const ready = find('Ready for your next request');
  await view.press(press(title.x, title.y) + drag(ready.end, ready.y) + release(ready.end, ready.y));
  expect(copied[1]).toBe('WORKSPACE\nReady for your next request');
});

it('scrolls while dragging past the top edge and copies rows that were off screen', async () => {
  const { view, copied, find } = workspace(messages);
  const from = find('Message 45');
  const firstVisible = Number(/Message (\d+)/.exec(view.frame().split('\n').slice(-ROWS)[0]!)?.[1]);
  await view.press(press(from.end, from.y) + drag(from.x, 1));
  await vi.waitFor(() => expect(view.frame()).toContain(`Message ${firstVisible - 4}`), { timeout: 3000 });
  await view.press(release(from.x, 1));
  const lines = copied[0]!.split('\n').map((line) => line.trim());
  expect(lines.at(-1)).toBe('Message 45');
  const first = Number(/Message (\d+)/.exec(lines[0]!)?.[1]);
  expect(first).toBeLessThan(firstVisible);
  expect(lines).toEqual(Array.from({ length: 45 - first + 1 }, (_, i) => `Message ${first + i}`));
});

it('reverses edge scrolling when the drag crosses from above the chat to below it', async () => {
  const { view, copied, find } = workspace(messages);
  const from = find('Message 45');
  const composer = find('What would you like to do?');
  await view.press(press(from.x, from.y) + drag(from.x, 1));
  await vi.waitFor(() => expect(view.frame()).toContain('Earlier messages'), { timeout: 3000 });
  await view.press(drag(from.x, composer.y));
  await vi.waitFor(() => expect(view.frame()).not.toContain('Earlier messages'), { timeout: 3000 });
  await view.press(release(from.x, composer.y));
  const lines = copied[0]!.split('\n').map((line) => line.trim());
  expect(lines[0]).toBe('Message 45');
  expect(lines.at(-1)).toBe('Message 59');
});

it('selects a word on double click and a row on triple click', async () => {
  const { view, copied, find } = workspace(messages);
  const at = find('Message 50');
  const click = press(at.x + 2, at.y) + release(at.x + 2, at.y);
  await view.press(click + click);
  expect(copied).toEqual(['Message']);
  await view.press(click);
  expect(copied.at(-1)?.trim()).toBe('Message 50');
});

it('clears a selection with Escape without cancelling the prompt, and plain clicks copy nothing', async () => {
  const { view, copied, find } = workspace(messages);
  await view.press('keep');
  const at = find('Message 52');
  await view.press(press(at.x, at.y) + release(at.x, at.y));
  expect(copied).toEqual([]);
  await view.press(press(at.x, at.y) + drag(at.end, at.y) + release(at.end, at.y));
  expect(copied).toEqual(['Message 52']);
  const before = view.terminalOutput().length;
  await view.press('\u001b');
  expect(view.terminalOutput().slice(before)).toContain('\u001b[K');
  expect(view.session.get().mode).toBe('prompt');
  expect(view.session.get().draft).toBe('keep');
});

it('opens the workspace on the alternate screen and leaves mouse reporting off when disabled', async () => {
  const { view, copied, find } = workspace(messages, { mouse: false });
  expect(view.terminalOutput()).toContain(ALT_ON);
  expect(view.terminalOutput()).not.toContain(MOUSE_ON);
  expect(view.frame()).toContain('PgUp/PgDn chat · Ctrl+B hide sidebar');
  const at = find('Message 52');
  await view.press(press(at.x, at.y) + drag(at.end, at.y) + release(at.end, at.y));
  expect(copied).toEqual([]);
  view.close();
  expect(view.terminalOutput().lastIndexOf(ALT_OFF)).toBeGreaterThan(view.terminalOutput().lastIndexOf('Message 59'));
});

it('releases the mouse before leaving the alternate screen, then prints workspace output to history', async () => {
  const { view } = workspace(['Before workspace']);
  view.session.writeLine('Arrived in workspace');
  await view.press('\u0002');
  const output = view.terminalOutput();
  const leave = output.lastIndexOf(ALT_OFF);
  expect(output.lastIndexOf(MOUSE_OFF)).toBeLessThan(leave);
  expect(output.indexOf('Arrived in workspace', leave)).toBeGreaterThan(leave);
  expect(output.indexOf(ALT_ON)).toBeLessThan(output.indexOf(MOUSE_ON));
});
