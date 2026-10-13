import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBase } from '../checkout-sync.js';
import { expect, it, vi } from 'vitest';
import { screen } from './workspace-fixture.js';

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
  expect(view.frame()).toContain('unfinished request');
  expect(view.session.get().draft).toBe('unfinished request');
  await view.press('\u0002');
  expect(view.frame()).not.toContain('WORKSPACE');
  expect(
    view.terminalOutput().endsWith('\u001b[?1000l\u001b[?1006l') || view.terminalOutput().includes('\u001b[?1000l'),
  ).toBe(true);
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

it.each([Buffer.from('\u001b[<64;10;5M'), Buffer.from([0x1b, 0x5b, 0x4d, 0x60, 42, 37])])(
  'buffers a mouse report at every byte boundary without cancelling a choice',
  async (report) => {
    const view = screen();
    for (let i = 0; i < 60; i++) view.session.writeLine(`Framed line ${i}`);
    const answer = view.session.prompt(['Fix', 'Back'], 'Delivery choice');
    for (let split = 1; split < report.length; split++) {
      await view.press(report.subarray(0, split), true);
      expect(view.session.get().mode).toBe('pick');
      await view.press(report.subarray(split), true);
      expect(view.session.get().mode).toBe('pick');
      expect(view.session.get().pickIndex).toBe(0);
    }
    expect(view.frame()).toContain('Earlier messages');
    await view.press('\u001b[', true);
    await view.press('B');
    expect(view.session.get().pickIndex).toBe(1);
    await view.press('\r');
    expect(await answer).toBe('Back');
  },
);

it('captures the wheel in the conversation, ignores sidebar clicks, and restores terminal reporting', async () => {
  const view = screen();
  void view.session.prompt();
  for (let i = 0; i < 60; i++) view.session.writeLine(`Message ${i}`);
  view.session.setDraft('keep this draft');
  expect(view.terminalOutput()).toContain('\u001b[?1006h\u001b[?1000h');
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
  expect(view.terminalOutput()).toContain('\u001b[?1000l\u001b[?1006l');
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

it.each([80, 150])('keeps mouse-like pasted text intact at width %i', async (columns) => {
  const view = screen(columns, 28);
  void view.session.prompt();
  for (const paste of ['[<T>() => T]', '[<64;10;5M', '[MABC']) {
    view.session.setDraft('');
    await view.press(paste);
    expect(view.session.get().draft).toBe(paste);
  }
});

it('handles legacy wheel reports while an agent runs without leaking bytes into its draft', async () => {
  const view = screen();
  view.session.setLocalTask('claude');
  for (let i = 0; i < 60; i++) view.session.writeLine(`Legacy line ${i}`);
  view.session.setDraft('follow-up');
  await view.press('\u001b[M`*%'.repeat(3));
  expect(view.frame()).toContain('Earlier messages');
  expect(view.frame()).not.toContain('Legacy line 59');
  expect(view.session.get().draft).toBe('follow-up');
  await view.press('\u001b[Ma*%'.repeat(10));
  expect(view.frame()).toContain('Legacy line 59');
  await view.press('\u001b[M *%\u001b[M#*%');
  expect(view.session.get().draft).toBe('follow-up');
});

it('reads legacy coordinate bytes above ASCII and keeps Unicode keyboard input intact', async () => {
  const view = screen();
  void view.session.prompt();
  for (let i = 0; i < 60; i++) view.session.writeLine(`Byte line ${i}`);
  await view.press('zażółć gęślą jaźń');
  const draft = view.session.get().draft;
  expect(draft).toBe('zażółć gęślą jaźń');
  await view.press(Buffer.from([0x1b, 0x5b, 0x4d, 0x60, 132, 37]));
  expect(view.frame()).toContain('Earlier messages');
  expect(view.session.get().draft).toBe(draft);
  await view.press(Buffer.from([0x1b, 0x5b, 0x4d, 0x61, 132, 37, 0x1b, 0x5b, 0x4d, 0x61, 132, 37]));
  expect(view.frame()).toContain('Byte line 59');
  await view.press(Buffer.from([0xe2]));
  expect(view.session.get().draft).toBe(draft);
  await view.press(Buffer.from([0x82, 0xac]));
  expect(view.session.get().draft).toBe(draft + '€');
  expect(view.inputEncoding()).toBe('latin1');
  view.session.writeLine('Diff: platform → local\n\n--- platform/game.ts\n+++ local/game.ts\n@@ -1 +1 @@\n-old\n+new');
  await view.press('q');
  expect(view.inputEncoding()).toBe('latin1');
  await view.press('ż');
  expect(view.session.get().draft).toBe(draft + '€ż');
  view.close();
  expect(view.inputEncoding()).toBe('utf8');
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

it('handles a mouse report and arrow key batched in one source read as separate events', async () => {
  const view = screen();
  for (let i = 0; i < 60; i++) view.session.writeLine(`Batch line ${i}`);
  const answer = view.session.prompt(['Fix', 'Back'], 'Delivery choice');
  await view.press('\u001b[<64;10;5M\u001b[B');
  expect(view.frame()).toContain('Earlier messages');
  expect(view.session.get().pickIndex).toBe(1);
  await view.press('\r');
  expect(await answer).toBe('Back');
  void view.session.prompt();
  view.session.setDraft('draft');
  await view.press('\u001b[<64;10;5M\u001b[D');
  await view.press('X');
  expect(view.session.get().draft).toBe('drafXt');
});

it('keeps Linux-console function keys intact without inserting their trailing letters', async () => {
  const view = screen();
  void view.session.prompt();
  view.session.setDraft('keep draft');
  await view.press('\u001b[[A\u001b[[B\u001b[[C\u001b[[D\u001b[[E');
  expect(view.session.get().draft).toBe('keep draft');
  await view.press('\u001b[[', true);
  await view.press('A');
  expect(view.session.get().draft).toBe('keep draft');
});

it('keeps all VT100 and application-keypad SS3 codes out of the composer', async () => {
  const view = screen();
  void view.session.prompt();
  view.session.setDraft('keep draft');
  await view.press(
    ['t', 'u', 'v', 'l', 'w', 'x', 'M', 'p', 'q', 'r', 's', 'y'].map((suffix) => '\u001bO' + suffix).join(''),
  );
  expect(view.session.get().draft).toBe('keep draft');
  await view.press('\u001bO', true);
  await view.press('t');
  expect(view.session.get().draft).toBe('keep draft');
  await view.press('ordinary text');
  expect(view.session.get().draft).toBe('keep draftordinary text');
  const answer = view.session.prompt(['Fix', 'Back'], 'Modified SS3 key');
  await view.press('\u001bO1;5B');
  expect(view.session.get().pickIndex).toBe(1);
  await view.press('\r');
  expect(await answer).toBe('Back');
});

it('keeps local ownership and queued messages visible without claiming a delivery', async () => {
  const view = screen(150, 28, 0, undefined, undefined, false);
  view.session.setLive(['Studio: queued (no_agent_yet)']);
  view.session.setLocalTask('muse');
  await view.press('follow-up');
  await view.press('\r');
  await view.press('\u0002');
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
    const view = screen(150, 28, 0, () => ({ root, slug: 'sky' }), undefined, false);
    void view.session.prompt();
    await view.press('\u0002');
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
