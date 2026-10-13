import { expect, it, vi } from 'vitest';
import { screen } from './workspace-fixture.js';
import * as transcript from './transcript.js';

it('typing in a long conversation does not redraw hidden messages', async () => {
  const draw = vi.spyOn(transcript, 'TranscriptLine');
  try {
    const view = screen();
    view.session.restoreHistory({
      lines: Array.from({ length: 300 }, (_, index) => `History ${index}: ${'wrapped text '.repeat(12)}`),
      prompts: [],
    });
    void view.session.prompt();
    expect(view.frame()).toContain('History 299');
    draw.mockClear();
    await view.press('typing stays responsive');
    expect(view.session.get().draft).toBe('typing stays responsive');
    expect(draw.mock.calls.length).toBeLessThan(28);
    expect(view.frame()).toContain('History 299');
    await view.press('\u001b[5~');
    expect(view.frame()).toContain('Earlier messages');
    expect(view.frame()).not.toContain('History 299');
    await view.press('\u001b[6~'.repeat(3));
    expect(view.frame()).toContain('History 299');
    view.resize(130, 20);
    expect(view.frame()).toContain('History 299');
    expect(view.session.get().draft).toBe('typing stays responsive');
  } finally {
    draw.mockRestore();
  }
});

it('toggles wheel scroll reporting with Ctrl+T and preserves native selection by default', async () => {
  const view = screen();
  view.session.setLocalTask('codex');
  view.session.setDraft('keep this draft');
  view.session.writeLine('Copy this output');
  expect(view.terminalOutput()).not.toContain('\u001b[?1006h\u001b[?1000h');
  expect(view.frame()).toContain('Ctrl+T wheel scroll');
  await view.press('\u0014');
  expect(view.frame()).toContain('Ctrl+T text selection');
  expect(view.terminalOutput()).toContain('\u001b[?1006h\u001b[?1000h');
  await view.press('\u0014');
  expect(view.frame()).toContain('Ctrl+T wheel scroll');
  expect(view.terminalOutput()).toContain('\u001b[?1000l\u001b[?1006l');
  expect(view.session.get().draft).toBe('keep this draft');
  const stop = vi.spyOn(view.session, 'cancel').mockImplementation(() => {});
  await view.press('\u0003');
  expect(stop).toHaveBeenCalledOnce();
});

it('pauses diagnostics polling while scrolling', async () => {
  vi.useFakeTimers();
  try {
    const read = vi.fn(() => Array.from({ length: 60 }, (_, i) => `Diagnostic ${i}`));
    const view = screen(150, 28, 0, () => null, read);
    view.session.setLocalTask('codex');
    await view.press('\u000c');
    expect(view.frame()).toContain('Task diagnostics · live');
    await view.press('\u001b[A');
    expect(view.frame()).toContain('Task diagnostics · paused');
    read.mockClear();
    await vi.advanceTimersByTimeAsync(3000);
    expect(read).not.toHaveBeenCalled();
    await view.press('\u001b[B');
    expect(view.frame()).toContain('Task diagnostics · live');
    await vi.advanceTimersByTimeAsync(500);
    expect(read).toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it('disables wheel reporting in compact view and restores toggle state when widened', async () => {
  const view = screen();
  void view.session.prompt();
  await view.press('\u0014');
  expect(view.terminalOutput()).toContain('\u001b[?1006h\u001b[?1000h');
  view.resize(80, 12);
  expect(view.terminalOutput()).toContain('\u001b[?1000l\u001b[?1006l');
  view.resize(150, 28);
  expect(view.terminalOutput().split('\u001b[?1006h\u001b[?1000h')).toHaveLength(3);
});
