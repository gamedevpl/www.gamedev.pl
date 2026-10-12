import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBase } from '../checkout-sync.js';
import type { WorkspaceCheckout } from './workspace-status.js';
import { PassThrough, Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { createElement } from 'react';
import { render } from 'ink';
import { afterEach, expect, it, vi } from 'vitest';
import { ReplApp } from './app.js';
import { createTuiSession } from './session.js';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));
function screen(
  columns = 150,
  rows = 28,
  historyOffset = 0,
  checkout: () => WorkspaceCheckout | null = () => null,
  readLogs?: () => string[],
) {
  const session = createTuiSession('');
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const frames: string[] = [];
  const terminal: string[] = [];
  const output = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        terminal.push(String(chunk));
        frames.push(stripVTControlCharacters(String(chunk)));
        done();
      },
    }),
    { columns, rows, isTTY: true },
  );
  const element = () => createElement(ReplApp, { session, color: false, checkout, historyOffset, readLogs });
  const app = render(element(), {
    stdin: input as unknown as NodeJS.ReadStream,
    stdout: output as unknown as NodeJS.WriteStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const settle = () => app.rerender(element());
  settle();
  cleanups.push(() => {
    app.unmount();
    session.close();
    input.end();
    output.end();
  });
  return {
    session,
    frame: () => frames.at(-1) ?? '',
    takeOutput: () => frames.splice(0).join(''),
    terminalOutput: () => terminal.join(''),
    close: () => app.unmount(),
    async press(keys: string) {
      settle();
      input.write(keys);
      await vi.waitFor(() => expect(input.readableLength).toBe(0), { interval: 1 });
      settle();
    },
    resize(width: number, height: number) {
      output.columns = width;
      output.rows = height;
      output.emit('resize');
      settle();
    },
  };
}

it('shows a bounded split, preserves the draft while toggling, and pages wrapped conversation', async () => {
  const view = screen();
  void view.session.prompt();
  for (let i = 0; i < 40; i++) view.session.writeLine(`codex ▸ Message ${i} · ${'długa odpowiedź '.repeat(8)}`);
  view.session.setDraft('unfinished request');
  expect(view.frame()).toContain('WORKSPACE');
  expect(view.frame()).toContain('Message 39');
  expect(view.frame()).not.toContain('Message 0 ·');
  expect(view.frame().trimEnd().split('\n').length).toBeLessThan(28);
  await view.press('\u001b[5~');
  expect(view.frame()).toContain('Earlier messages');
  expect(view.frame()).not.toContain('Message 39');
  await view.press('\u001b[6~');
  expect(view.frame()).toContain('Message 39');
  await view.press('\u0002');
  expect(view.frame()).not.toContain('WORKSPACE');
  expect(view.frame()).toContain('unfinished request');
  expect(view.session.get().draft).toBe('unfinished request');
  await view.press('\u0002');
  expect(view.frame()).toContain('WORKSPACE');
  view.takeOutput();
  view.resize(80, 24);
  expect(view.takeOutput()).toContain('Message 39');
  expect(view.frame()).not.toContain('WORKSPACE');
  expect(view.session.get().draft).toBe('unfinished request');
  view.resize(150, 28);
  expect(view.frame()).toContain('WORKSPACE');
  expect(view.frame()).toContain('Message 39');
});

it('captures the wheel in the conversation, ignores sidebar clicks, and restores terminal reporting', async () => {
  const view = screen();
  void view.session.prompt();
  for (let i = 0; i < 60; i++) view.session.writeLine(`Message ${i}`);
  view.session.setDraft('keep this draft');
  expect(view.terminalOutput()).toContain('\u001b[?1000h\u001b[?1006h');
  await view.press('\u001b[<64;10;5M'.repeat(3));
  expect(view.frame()).toContain('Earlier messages');
  expect(view.frame()).not.toContain('Message 59');
  const earlier = view.frame();
  await view.press('\u001b[<65;140;5M');
  expect(view.frame()).toBe(earlier);
  await view.press('\u001b[<0;10;5M\u001b[<0;10;5m');
  expect(view.session.get().draft).toBe('keep this draft');
  await view.press('\u001b[<65;10;5M'.repeat(10));
  expect(view.frame()).toContain('Message 59');
  expect(view.frame()).not.toContain('Earlier messages');
  view.resize(80, 24);
  expect(view.terminalOutput()).toContain('\u001b[?1006l\u001b[?1000l');
  view.resize(150, 28);
  const resets = view.terminalOutput().split('\u001b[?1006l').length;
  view.close();
  expect(view.terminalOutput().split('\u001b[?1006l').length).toBe(resets + 1);
});

it('scrolls during local work without putting fragmented mouse reports into the queued draft', async () => {
  const view = screen();
  view.session.setLocalTask('claude');
  for (let i = 0; i < 60; i++) view.session.writeLine(`Agent line ${i}`);
  view.session.setDraft('follow-up');
  await view.press('\u001b[<64;');
  await view.press('10;5M');
  expect(view.frame()).toContain('Earlier messages');
  expect(view.session.get().draft).toBe('follow-up');
  await view.press('\u001b[<65;10;5M'.repeat(10));
  expect(view.frame()).toContain('Agent line 59');
});

it('keeps verification output visible and scrollable while a delivery choice is open', async () => {
  const view = screen();
  for (let i = 0; i < 60; i++) view.session.writeLine(`Check output ${i}`);
  const answer = view.session.prompt(['Fix with agent', 'Back'], 'Local checks blocked delivery');
  expect(view.frame()).toContain('Check output 59');
  await view.press('\u001b[<64;10;5M'.repeat(4));
  expect(view.frame()).toContain('Earlier messages');
  expect(view.frame()).not.toContain('Check output 59');
  expect(view.frame()).toContain('Fix with agent');
  expect(view.session.get().pickIndex).toBe(0);
  await view.press('2');
  expect(await answer).toBe('Back');
});

it('routes the wheel to a long question without answering or moving its choices', async () => {
  const view = screen();
  const answer = view.session.prompt(
    ['Allow once', 'Deny'],
    Array.from({ length: 80 }, (_, i) => `Question line ${i}`).join('\n'),
  );
  expect(view.frame()).toContain('Question line 0');
  await view.press('\u001b[<65;10;10M');
  expect(view.frame()).not.toContain('Question line 0');
  expect(view.frame()).toContain('Question line 3');
  expect(view.session.get().pickIndex).toBe(0);
  await view.press('2');
  expect(await answer).toBe('Deny');
});

it('scrolls a diff under the pointer without inserting reports into the composer', async () => {
  const view = screen();
  void view.session.prompt();
  view.session.setDraft('keep draft');
  view.session.writeLine(
    [
      'Diff: platform → local',
      '',
      '--- platform/game.ts',
      '+++ local/game.ts',
      '@@ -1 +1 @@',
      ...Array.from({ length: 80 }, (_, i) => `+const line${i} = ${i};`),
    ].join('\n'),
  );
  await view.press('\u001b[<65;10;5M'.repeat(4));
  expect(view.frame()).toContain('Diff · platform');
  expect(view.frame()).not.toContain('--- platform/game.ts');
  expect(view.session.get().draft).toBe('keep draft');
  await view.press('q');
  expect(view.frame()).toContain('keep draft');
});

it('leaves native terminal scrolling enabled for compact terminals', () => {
  const view = screen(80, 24);
  expect(view.terminalOutput()).not.toContain('\u001b[?1000h');
});

it('scrolls diagnostics under the pointer and returns to the unchanged draft', async () => {
  const view = screen(
    150,
    28,
    0,
    () => null,
    () => Array.from({ length: 60 }, (_, i) => `Diagnostic line ${i}`),
  );
  void view.session.prompt();
  view.session.setDraft('my draft');
  await view.press('\u000c');
  expect(view.frame()).toContain('Diagnostic line 59');
  await view.press('\u001b[<64;10;5M'.repeat(4));
  expect(view.frame()).toContain('paused');
  expect(view.frame()).not.toContain('Diagnostic line 59');
  await view.press('\u001b');
  expect(view.frame()).toContain('my draft');
});

it.each([
  [120, 16],
  [150, 28],
  [200, 40],
])('keeps long approvals and choices reachable at %i × %i', async (columns, rows) => {
  const view = screen(columns, rows);
  const choice = view.session.prompt(
    ['Allow once', 'Deny'],
    Array.from({ length: 40 }, (_, i) => `polecenie ${i} ${'bardzo długa nazwa '.repeat(5)}`).join('\n'),
  );
  expect(view.frame()).toContain('Allow once');
  expect(view.frame()).toContain('Deny');
  expect(view.frame().trimEnd().split('\n').length).toBeLessThanOrEqual(rows);
  await view.press('\u001b[6~');
  expect(view.frame()).not.toContain('Earlier messages');
  await view.press('2');
  expect(await choice).toBe('Deny');
});

it('keeps local ownership and queued messages visible without claiming a delivery', async () => {
  const view = screen();
  view.session.setLive(['Studio: queued (no_agent_yet)']);
  view.session.setLocalTask('muse');
  await view.press('follow-up');
  await view.press('\r');
  expect(view.frame()).toContain('Local agent: muse');
  expect(view.frame()).toContain('1 queued');
  expect(view.frame()).toContain('Delivery happens after /submit');
  expect(view.frame()).not.toContain('no_agent_yet');
});

it('does not replay messages predating a native terminal handoff', () => {
  const view = screen(150, 28, 1);
  view.session.writeLine('before handoff');
  view.session.writeLine('after handoff');
  expect(view.frame()).not.toContain('before handoff');
  expect(view.frame()).toContain('after handoff');
});

it('refreshes local edits only while visible, and refreshes again when restored', async () => {
  vi.useFakeTimers();
  const root = mkdtempSync(join(tmpdir(), 'sidebar-live-'));
  try {
    const game = join(root, 'games', 'sky');
    mkdirSync(game, { recursive: true });
    writeBase(root, 'v1', [{ path: 'game.ts', content: 'before' }]);
    writeFileSync(join(game, 'game.ts'), 'before');
    const view = screen(150, 28, 0, () => ({ root, slug: 'sky' }));
    void view.session.prompt();
    expect(view.frame()).toContain('No local changes');
    writeFileSync(join(game, 'game.ts'), 'after');
    await vi.advanceTimersByTimeAsync(3000);
    expect(view.frame()).toContain('M game.ts');
    await view.press('draft');
    await view.press('\u0002');
    expect(vi.getTimerCount()).toBe(0);
    writeFileSync(join(game, 'game.ts'), 'before');
    await view.press('\u0002');
    expect(view.frame()).toContain('No local changes');
    expect(view.session.get().draft).toBe('draft');
  } finally {
    vi.useRealTimers();
    rmSync(root, { recursive: true, force: true });
  }
});
