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
