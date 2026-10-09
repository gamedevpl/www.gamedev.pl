import { PassThrough, Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { createElement } from 'react';
import { render } from 'ink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectSession } from '../connect-flow.js';
import type { ApiClient } from '../api.js';
import { ReplApp } from './app.js';
import { createTuiSession } from './session.js';
import { approvalPrompt, AUTO_NEXT } from '../agent-approval.js';
import { commandApprovalMemory } from '../agent-approval-memory.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
// Only for timer-driven changes: animation frames, the silence clock.
const until = (check: () => void) => vi.waitFor(check, { timeout: 5000 });
function screen(columns: number, rows: number, openPreview?: (url: string) => void, readLogs?: () => string[]) {
  const session = createTuiSession('');
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const frames: string[] = [];
  // Debug-mode Ink writes each commit synchronously; record frames without buffering.
  const output = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        frames.push(stripVTControlCharacters(String(chunk)));
        done();
      },
    }),
    { columns, rows, isTTY: true },
  );
  const element = () => createElement(ReplApp, { session, color: false, openPreview, readLogs });
  const app = render(element(), {
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
  // A sync re-render flushes pending effects: subscriptions, stdin, key handlers.
  const settle = () => app.rerender(element());
  settle();
  return {
    session,
    input,
    // Resolves once Ink has read the keys and flushed their effects.
    async press(keys: string) {
      settle();
      input.write(keys);
      await vi.waitFor(() => expect(input.readableLength).toBe(0));
      settle();
    },
    frame: () =>
      frames.filter((frame) => frame.includes('gamedevpl') || frame.includes('Task diagnostics')).at(-1) ?? '',
  };
}

describe('TUI feedback', () => {
  it.each([
    [40, 12],
    [80, 24],
    [110, 40],
  ])('pages a complete approval request at %i × %i without hiding choices', async (columns, rows) => {
    const view = screen(columns, rows);
    view.session.setLocalTask('claude');
    const autoNext = vi.fn();
    const approve = approvalPrompt({
      agent: 'claude',
      cwd: '/game',
      remembered: commandApprovalMemory(view.session),
      pick: view.session.prompt,
      signal: new AbortController().signal,
      write: view.session.writeLine,
      autoNext,
    });
    const command = Array.from({ length: 30 }, (_, i) => `printf "part-${i}"; cat game/file-${i}.ts`).join('\n');
    const pending = approve({ id: 'a', kind: 'command', detail: { tool_name: 'Bash', input: { command } } });
    await until(() => expect(view.session.get().mode).toBe('pick'));
    expect(view.frame()).toContain('Command:');
    expect(view.frame()).toContain('1. Allow once');
    expect(view.frame()).toContain('2. Deny');
    expect(view.frame()).toContain('PgUp/PgDn');
    const pages: string[] = [];
    for (let i = 0; i < 60; i++) {
      pages.push(view.frame());
      expect(view.frame().trimEnd().split('\n').length).toBeLessThanOrEqual(rows);
      await view.press('\u001b[6~');
    }
    const complete = pages.join('\n');
    for (let i = 0; i < 30; i++) expect(complete).toContain(`part-${i}`);
    expect(complete).toContain('This task stays in Ask.');
    await view.press('\u001b[5~');
    expect(view.session.get().pickIndex).toBe(0);
    expect(autoNext).not.toHaveBeenCalled();
    await view.press('4');
    expect(await pending).toBe('approve');
    expect(autoNext).toHaveBeenCalledOnce();
    expect(view.session.get().choices).not.toContain(AUTO_NEXT);
    void view.session.prompt(['Allow once', 'Deny'], 'Command: npm test');
    expect(view.frame()).toContain('Command: npm test');
  });
  it.each([40, 110])('accepts a queued follow-up during a local task at width %s', async (width) => {
    const openPreview = vi.fn();
    const view = screen(width, 16, openPreview);
    view.session.setLocalTask('codex');
    view.session.setPreview('http://127.0.0.1:1234/test/');
    await view.press('more ramps');
    expect(view.session.get().draft).toBe('more ramps');
    expect(openPreview).not.toHaveBeenCalled();
    await view.press('\r');
    expect(view.session.get().queued).toEqual(['more ramps']);
    expect(view.frame()).toContain('1 queued');
    await view.press('\u000f');
    expect(openPreview).toHaveBeenCalledOnce();
  });
  it('shows the selected model and effort in a narrow picker', () => {
    const view = screen(40, 12);
    void view.session.prompt(
      ['codex — model: gpt-5.3-codex; effort: xhigh — this checkout; own billing', 'Configure agent model and effort…'],
      'Who should build this task?',
    );
    expect(view.frame()).toContain('effort: xhigh');
    expect(view.frame()).toContain('gpt-5.3-codex');
  });
  it('moves the cursor and inserts text inside a long draft', async () => {
    const view = screen(40, 12);
    void view.session.prompt();
    view.session.setDraft('0123456789'.repeat(5));
    expect(view.frame()).toContain('█');
    await view.press('\u001b[D');
    await view.press('X');
    expect(view.session.get()).toMatchObject({ draft: `${'0123456789'.repeat(4)}012345678X9`, draftCursor: 50 });
    expect(view.frame()).toContain('█9');
    expect(view.frame()).toContain('←→');
  });

  it('opens the live preview with o while an agent is working', async () => {
    const openPreview = vi.fn();
    const view = screen(80, 24, openPreview);
    view.session.setPreview('http://127.0.0.1:64897/preview/');
    expect(view.frame()).toContain('o open preview');
    await view.press('o');
    expect(openPreview).toHaveBeenCalledWith('http://127.0.0.1:64897/preview/');

    view.session.clearPreview();
    expect(view.frame()).not.toContain('o open preview');
    await view.press('o');
    expect(openPreview).toHaveBeenCalledTimes(1);
  });

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
    await until(() => expect(view.session.get().mode).toBe('pick'));
    expect(view.frame()).toContain('how would you like to work?');
    expect(view.frame()).toContain('Open a local checkout');
    view.session.movePick(1);
    view.session.submit();
    expect(await opened).toMatchObject({ slug: 'sky', token: 'tok' });
    void view.session.prompt();
    expect(view.frame()).toContain('What would you like to do?');
    expect(view.frame()).toContain('/checkout');
  });
  it('immediately replaces input with an animated activity and returns to a ready prompt', async () => {
    const view = screen(80, 24);
    const pending = view.session.prompt();
    view.session.setDraft('chce zagrac');
    view.session.submit();
    await pending;
    view.session.setActivity('Thinking about your request');
    const first = view.frame();
    expect(first).toContain('Thinking about your request');
    expect(first).toContain('input paused');
    expect(first).not.toContain('What would you like');
    await until(() => expect(view.frame()).not.toBe(first));
    void view.session.prompt();
    expect(view.frame()).toContain('What would you like to do?');
    expect(view.frame()).not.toContain('Thinking about your request');
  });
  it.each([
    [40, 12],
    [80, 24],
    [120, 40],
  ])('keeps controls visible at %i × %i with long text and a long picker', (columns, rows) => {
    const view = screen(columns, rows);
    view.session.writeLine('Bardzo długa odpowiedź o grze i aktualizacji '.repeat(30));
    view.session.setLive(['published', 'https://www.gamedev.pl/play/airtime']);
    void view.session.prompt(
      Array.from({ length: 20 }, (_, i) => `Agent ${i + 1} — dostępne narzędzie z bardzo długą nazwą`),
      'Które narzędzie ma wykonać zmianę?',
    );
    view.session.movePick(19);
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
  expect(view.frame()).toContain('Update Creator Kit now');
  expect(view.frame()).toContain('Later');
  view.session.submit();
  expect(await choice).toBe('Update Creator Kit now');
  view.session.setActivity('Downloading Creator Kit and installing dependencies');
  expect(view.frame()).toContain('Downloading Creator Kit');
  expect(view.frame()).toContain('input paused');
  expect(view.frame()).not.toContain('What would you like');
});

describe('command completion keyboard', () => {
  it('completes /pu with Tab without submitting, then sends on Enter', async () => {
    const view = screen(80, 24);
    const pending = view.session.prompt();
    await view.press('/pu');
    expect(view.frame()).toContain('/pull — update a checkout');
    await view.press('\t');
    expect(view.session.get().draft).toBe('/pull ');
    expect(view.session.get().mode).toBe('prompt');
    await view.press('\r');
    expect(await pending).toBe('/pull ');
  });

  it('selects matches with arrows and fills a partial command with Enter', async () => {
    const view = screen(80, 24);
    void view.session.prompt();
    await view.press('/p');
    expect(view.frame()).toContain('▸ /permissions');
    await view.press('\x1b[B');
    expect(view.frame()).toContain('▸ /play');
    await view.press('\r');
    expect(view.session.get().draft).toBe('/play ');
    expect(view.session.get().mode).toBe('prompt');
  });

  it('dismisses suggestions without clearing text, preserves history and ignores Tab in prose', async () => {
    const view = screen(80, 24);
    void view.session.prompt();
    view.session.setDraft('previous request');
    view.session.submit();
    void view.session.prompt();
    await view.press('/p');
    await view.press('\x1b');
    expect(view.session.get().draft).toBe('/p');
    expect(view.frame()).not.toContain('▸ /play');
    await view.press('\x1b[A');
    expect(view.session.get().draft).toBe('previous request');
    await view.press('\t');
    expect(view.session.get().draft).toBe('previous request');
    await view.press('\x1b[B');
    expect(view.session.get().draft).toBe('/p');
  });

  it('walks past recalled commands and restores the draft without opening suggestions', async () => {
    const view = screen(80, 24);
    for (const line of ['older request', '/help']) {
      void view.session.prompt();
      view.session.setDraft(line);
      view.session.submit();
    }
    void view.session.prompt();
    view.session.setDraft('unfinished request');
    await view.press('\x1b[A');
    expect(view.session.get().draft).toBe('/help');
    expect(view.frame()).not.toContain('▸ /help');
    await view.press('\x1b[A');
    expect(view.session.get().draft).toBe('older request');
    await view.press('\x1b[B');
    expect(view.session.get().draft).toBe('/help');
    await view.press('\x1b[B');
    expect(view.session.get().draft).toBe('unfinished request');
    await view.press('\x1b[A');
    await view.press('\x7f');
    expect(view.session.get().draft).toBe('/hel');
    expect(view.frame()).toContain('▸ /help');
    await view.press('\t');
    expect(view.session.get().draft).toBe('/help ');
  });

  it.each([
    [40, 12],
    [80, 24],
    [120, 40],
  ])('scrolls all commands within %i × %i alongside status', async (columns, rows) => {
    const view = screen(columns, rows);
    view.session.setLive(['building', 'gate_not_started', 'live preview', 'czekamy na zakończenie']);
    void view.session.prompt();
    await view.press('/');
    await view.press('\x1b[A');
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
    await until(() => expect(view.frame()).toContain('No new output for 45s'));
    view.session.writeLine('Muse is reading game.ts');
    expect(view.frame()).not.toContain('No new output');
  } finally {
    clock.mockRestore();
  }
});

it('shows local ownership instead of a stale remote no-agent status', () => {
  const view = screen(80, 24);
  view.session.setLive(['Studio: queued (no_agent_yet)']);
  view.session.setLocalTask('muse');
  expect(view.frame()).toContain('Local task: muse');
  expect(view.frame()).toContain('after /submit');
  expect(view.frame()).not.toContain('no_agent_yet');
  view.session.setLive(['Studio: queued (no_agent_yet)']);
  expect(view.frame()).not.toContain('no_agent_yet');
  view.session.setLocalTask('');
  expect(view.frame()).toContain('Studio: queued');
});

it.each([40, 110])('distinguishes live send and explicit queue at width %s', async (width) => {
  const view = screen(width, 16);
  let acknowledge!: () => void;
  const send = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      }),
  );
  view.session.setLocalTask('muse');
  view.session.setSteering(send);
  await view.press('change the ramps');
  await view.press('\r');
  expect(send).toHaveBeenCalledWith('change the ramps');
  expect(view.frame()).toContain('Message the active agent');
  expect(view.frame().trimEnd().split('\n').length).toBeLessThanOrEqual(16);
  expect(view.session.get().queued).toEqual([]);
  acknowledge();
  await until(() => expect(view.session.get().sendStatus).toBe('Accepted by the agent'));
  await view.press('later task');
  await view.press('\u0011');
  expect(view.session.get().queued).toEqual(['later task']);
  expect(send).toHaveBeenCalledOnce();
});

it.each([40, 110])('opens live logs at width %s without sending or queuing /logs', async (width) => {
  const view = screen(width, 24, undefined, () => ['diagnostic detail']);
  view.session.setLocalTask('muse');
  const send = vi.fn(async () => {});
  view.session.setSteering(send);
  view.session.setDraft('/logs');
  await view.press('\r');
  expect(view.frame()).toContain('Task diagnostics');
  expect(view.frame()).toContain('diagnostic detail');
  expect(view.session.get().queued).toEqual([]);
  expect(send).not.toHaveBeenCalled();
  expect(view.session.get().draft).toBe('');
  await view.press('\u001b');
  expect(view.frame()).not.toContain('Task diagnostics');
});

it('keeps diagnostics out of conversation history after a task', async () => {
  const view = screen(110, 24, undefined, () => ['private diagnostic detail']);
  void view.session.prompt();
  view.session.setDraft('/logs');
  await view.press('\r');
  expect(view.frame()).toContain('Task diagnostics');
  expect(view.session.savedHistory().lines.join('\n')).not.toContain('private diagnostic detail');
  await view.press('\u001b');
  expect(view.session.get().mode).toBe('prompt');
});
