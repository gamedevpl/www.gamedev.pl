import { PassThrough } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { createElement } from 'react';
import { render } from 'ink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '../connect-flow.js';
import type { ApiClient } from '../api.js';
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
  return { session, input, frame: () => frames.filter((frame) => frame.includes('gamedevpl')).at(-1) ?? '' };
}

describe('TUI feedback', () => {
  it('shows connection choices and returns to chat for the selected game', async () => {
    const view = screen(80, 24);
    const opened = connectSession({
      api: { request: async () => ({ games: [{ slug: 'sky', token: 'tok' }] }) } as unknown as ApiClient,
      slug: 'sky',
      env: { PATH: '' },
      pick: view.session.prompt,
      abort: { current: null },
      write: view.session.writeLine,
    });
    await wait();
    expect(view.frame()).toContain('how would you like to work?');
    expect(view.frame()).toContain('Open a local checkout');
    view.session.movePick(1);
    view.session.submit();
    expect(await opened).toMatchObject({ slug: 'sky', token: 'tok' });
    void view.session.prompt();
    await wait();
    expect(view.frame()).toContain('What would you like to do?');
    expect(view.frame()).toContain('/checkout');
  });
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
    expect(frame.slice(frame.lastIndexOf('published')).trimEnd().split('\n').length).toBeLessThanOrEqual(rows);
  });
});

it('shows the Kit choice, then installation activity instead of an idle textbox', async () => {
  const view = screen(80, 24);
  const choice = view.session.prompt(
    ['Update Creator Kit now', 'Later'],
    'Update the game tools? Your local game edits will be kept.',
  );
  await wait();
  expect(view.frame()).toContain('Update Creator Kit now');
  expect(view.frame()).toContain('Later');
  view.session.submit();
  expect(await choice).toBe('Update Creator Kit now');
  view.session.setActivity('Downloading Creator Kit and installing dependencies');
  await wait();
  expect(view.frame()).toContain('Downloading Creator Kit');
  expect(view.frame()).toContain('input paused');
  expect(view.frame()).not.toContain('What would you like');
});

describe('command completion keyboard', () => {
  it('completes /pu with Tab without submitting, then sends on Enter', async () => {
    const view = screen(80, 24);
    const pending = view.session.prompt();
    await wait();
    view.input.write('/pu');
    await wait();
    expect(view.frame()).toContain('/pull — update a checkout');
    view.input.write('\t');
    await wait();
    expect(view.session.get().draft).toBe('/pull ');
    expect(view.session.get().mode).toBe('prompt');
    view.input.write('\r');
    expect(await pending).toBe('/pull ');
  });

  it('selects matches with arrows and fills a partial command with Enter', async () => {
    const view = screen(80, 24);
    void view.session.prompt();
    await wait();
    view.input.write('/p');
    await wait();
    expect(view.frame()).toContain('▸ /play');
    view.input.write('\x1b[B');
    await wait();
    expect(view.frame()).toContain('▸ /profile');
    view.input.write('\r');
    await wait();
    expect(view.session.get().draft).toBe('/profile ');
    expect(view.session.get().mode).toBe('prompt');
  });

  it('dismisses suggestions without clearing text, preserves history and ignores Tab in prose', async () => {
    const view = screen(80, 24);
    void view.session.prompt();
    view.session.setDraft('previous request');
    view.session.submit();
    void view.session.prompt();
    await wait();
    view.input.write('/p');
    await wait();
    view.input.write('\x1b');
    await wait();
    expect(view.session.get().draft).toBe('/p');
    expect(view.frame()).not.toContain('▸ /play');
    view.input.write('\x1b[A');
    await wait();
    expect(view.session.get().draft).toBe('previous request');
    view.input.write('\t');
    await wait();
    expect(view.session.get().draft).toBe('previous request');
    view.input.write('\x1b[B');
    await wait();
    expect(view.session.get().draft).toBe('/p');
  });

  it.each([
    [40, 12],
    [80, 24],
    [120, 40],
  ])('scrolls all commands within %i × %i alongside status', async (columns, rows) => {
    const view = screen(columns, rows);
    view.session.setLive(['building', 'gate_not_started', 'live preview', 'czekamy na zakończenie']);
    void view.session.prompt();
    await wait();
    view.input.write('/');
    await wait();
    view.input.write('\x1b[A');
    await wait();
    expect(view.frame()).toContain('▸ /whoami');
    expect(view.frame().trimEnd().split('\n').length).toBeLessThanOrEqual(rows);
    expect(view.frame()).toContain('Tab fill');
  });
});

it('reports silence without claiming progress and clears it on new output', async () => {
  let now = 100_000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const view = screen(80, 24);
    now += 45_000;
    await wait(150);
    expect(view.frame()).toContain('No new output for 45s');
    view.session.writeLine('Muse is reading game.ts');
    await wait();
    expect(view.frame()).not.toContain('No new output');
  } finally {
    clock.mockRestore();
  }
});

it('shows local ownership instead of a stale remote no-agent status', async () => {
  const view = screen(80, 24);
  view.session.setLive(['Studio: queued (no_agent_yet)']);
  view.session.setLocalTask('muse');
  await wait();
  expect(view.frame()).toContain('Local task: muse');
  expect(view.frame()).toContain('after /submit');
  expect(view.frame()).not.toContain('no_agent_yet');
  view.session.setLive(['Studio: queued (no_agent_yet)']);
  await wait();
  expect(view.frame()).not.toContain('no_agent_yet');
  view.session.setLocalTask('');
  await wait();
  expect(view.frame()).toContain('Studio: queued');
});
