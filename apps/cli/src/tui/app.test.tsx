import { PassThrough } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { createElement } from 'react';
import { render } from 'ink';
import { afterEach, describe, expect, it } from 'vitest';
import { ReplApp } from './app.js';
import { createTuiSession } from './session.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
function screen(columns: number, rows: number) {
  const session = createTuiSession('');
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const output = Object.assign(new PassThrough(), { columns, rows, isTTY: true });
  const frames: string[] = [];
  output.on('data', (chunk) => frames.push(stripVTControlCharacters(String(chunk))));
  const app = render(createElement(ReplApp, { session, color: false }), {
    stdin: input as unknown as NodeJS.ReadStream,
    stdout: output as unknown as NodeJS.WriteStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  cleanup.push(() => {
    app.unmount();
    session.close();
    input.end();
    output.end();
  });
  return { session, frame: () => frames.filter((frame) => frame.includes('gamedevpl')).at(-1) ?? '' };
}

describe('TUI feedback', () => {
  it('immediately replaces input with an animated activity and returns to a ready prompt', async () => {
    const view = screen(80, 24);
    const pending = view.session.prompt();
    await wait();
    view.session.setDraft('chce zagrac');
    view.session.submit();
    await pending;
    view.session.setActivity('Thinking about your request');
    await wait();
    const first = view.frame();
    expect(first).toContain('Thinking about your request');
    expect(first).toContain('input paused');
    expect(first).not.toContain('What would you like');
    await wait(150);
    expect(view.frame()).not.toBe(first);
    void view.session.prompt();
    await wait();
    expect(view.frame()).toContain('What would you like to do?');
    expect(view.frame()).not.toContain('Thinking about your request');
  });
  it.each([
    [40, 12],
    [80, 24],
    [120, 40],
  ])('keeps controls visible at %i × %i with long text and a long picker', async (columns, rows) => {
    const view = screen(columns, rows);
    view.session.writeLine('Bardzo długa odpowiedź o grze i aktualizacji '.repeat(30));
    view.session.setLive(['published', 'https://www.gamedev.pl/play/airtime']);
    void view.session.prompt(
      Array.from({ length: 20 }, (_, i) => `Agent ${i + 1} — dostępne narzędzie z bardzo długą nazwą`),
      'Które narzędzie ma wykonać zmianę?',
    );
    view.session.movePick(19);
    await wait();
    const frame = view.frame();
    expect(frame).toContain('20. Agent 20');
    expect(frame).toContain('gamedevpl');
    expect(frame.trimEnd().split('\n').length).toBeLessThanOrEqual(rows);
  });
});
