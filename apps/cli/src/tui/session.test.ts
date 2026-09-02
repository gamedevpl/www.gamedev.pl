import { describe, expect, it } from 'vitest';
import { createTuiSession } from './session.js';

describe('tui session', () => {
  it('resolves a prompt from submit and a pick from the highlighted choice', async () => {
    const session = createTuiSession('banner');
    const typed = session.prompt();
    session.setDraft('hello');
    session.submit();
    expect(await typed).toBe('hello');
    expect(session.get().lines.at(-1)).toBe('› hello');
    const picked = session.prompt(['calm', 'chaotic']);
    session.movePick(1);
    session.submit();
    expect(await picked).toBe('chaotic');
  });

  it('clears the draft on cancel, then quits', async () => {
    const session = createTuiSession('');
    const first = session.prompt();
    session.setDraft('nope');
    session.cancel();
    expect(session.get().draft).toBe('');
    session.cancel();
    expect(await first).toBe('/quit');
  });

  it('strips control characters from the draft', () => {
    const session = createTuiSession('');
    void session.prompt();
    session.setDraft('hello\r\n\u0007world');
    expect(session.get().draft).toBe('helloworld');
  });

  it('resolves a superseded prompt so it cannot hang', async () => {
    const session = createTuiSession('');
    const first = session.prompt();
    const second = session.prompt();
    session.setDraft('hello');
    session.submit();
    expect(await first).toBe('');
    expect(await second).toBe('hello');
  });
});
