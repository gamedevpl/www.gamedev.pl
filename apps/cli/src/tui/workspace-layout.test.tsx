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
function screen(columns = 150, rows = 28, historyOffset = 0, checkout: () => WorkspaceCheckout | null = () => null) {
  const session = createTuiSession('');
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  const frames: string[] = [];
  const output = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        frames.push(stripVTControlCharacters(String(chunk)));
        done();
      },
    }),
    { columns, rows, isTTY: true },
  );
  const element = () => createElement(ReplApp, { session, color: false, checkout, historyOffset });
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
  view.resize(80, 24);
  expect(view.frame()).not.toContain('WORKSPACE');
  expect(view.session.get().draft).toBe('unfinished request');
  view.resize(150, 28);
  expect(view.frame()).toContain('WORKSPACE');
  expect(view.frame()).toContain('Message 39');
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
