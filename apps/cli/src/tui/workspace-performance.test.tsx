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

it('restores native selection and holds the busy display until resuming current state', async () => {
  vi.useFakeTimers();
  try {
    const view = screen();
    view.session.setLocalTask('codex');
    view.session.setDraft('keep this draft');
    view.session.writeLine('Copy this output');
    await view.press('\u0014');
    expect(view.frame()).toContain('Text selection');
    expect(view.frame()).toContain('display paused');
    expect(view.terminalOutput()).toContain('\u001b[?1000l\u001b[?1006l');
    expect(vi.getTimerCount()).toBe(0);
    const frozen = view.frame();
    view.session.writeLine('Arrived while selecting');
    view.session.setLive(['Studio changed while selecting']);
    await vi.advanceTimersByTimeAsync(3000);
    expect(view.frame()).toBe(frozen);
    await view.press('ignored while copying');
    expect(view.session.get().draft).toBe('keep this draft');
    await view.press('\u0014');
    expect(view.frame()).toContain('Arrived while selecting');
    expect(view.frame()).not.toContain('Text selection');
    expect(view.frame()).toContain('keep this draft');
    expect(view.terminalOutput().split('\u001b[?1006h\u001b[?1000h')).toHaveLength(3);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await view.press('\u0014');
    const stop = vi.spyOn(view.session, 'cancel').mockImplementation(() => {});
    await view.press('\u0003');
    expect(stop).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('pauses diagnostics polling while selecting text', async () => {
  vi.useFakeTimers();
  try {
    const read = vi.fn(() => ['Diagnostic output']);
    const view = screen(150, 28, 0, () => null, read);
    view.session.setLocalTask('codex');
    await view.press('\u000c');
    expect(view.frame()).toContain('Task diagnostics');
    await view.press('\u0014');
    expect(view.frame()).toContain('Text selection');
    expect(vi.getTimerCount()).toBe(0);
    read.mockClear();
    await vi.advanceTimersByTimeAsync(3000);
    expect(read).not.toHaveBeenCalled();
    await view.press('\u0014');
    await vi.advanceTimersByTimeAsync(500);
    expect(read).toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
