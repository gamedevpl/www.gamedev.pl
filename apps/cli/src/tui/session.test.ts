import { describe, expect, it } from 'vitest';
import { createTuiSession, formatSessionIdentity } from './session.js';

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

  it('keeps live status across submit and stores the picker question', async () => {
    const session = createTuiSession('banner');
    session.setLive(['building']);
    session.setIdentity('gt · maze');
    const picked = session.prompt(['calm', 'chaotic'], 'What tone?');
    expect(session.get().question).toBe('What tone?');
    session.submit();
    expect(await picked).toBe('calm');
    expect(session.get().live).toEqual(['building']);
    expect(session.get().identity).toBe('gt · maze');
    expect(session.get().question).toBe('');
  });

  it('splits a multiline banner into transcript rows', () => {
    const session = createTuiSession('one\ntwo');
    expect(session.get().lines).toEqual(['one', 'two']);
    expect(formatSessionIdentity('gt', 'maze')).toBe('gt · maze');
    expect(formatSessionIdentity('', 'maze')).toBe('maze');
  });

  it('exits busy work from cancel when no prompt is pending', async () => {
    let interrupted = 0;
    const session = createTuiSession('', () => {
      interrupted += 1;
    });
    const typed = session.prompt();
    session.setDraft('go');
    session.submit();
    expect(await typed).toBe('go');
    expect(session.get().mode).toBe('busy');
    session.cancel();
    expect(interrupted).toBe(1);
  });

  it('clears the draft on cancel, then quits', async () => {
    const session = createTuiSession('');
    const first = session.prompt();
    session.setDraft('nope');
    session.cancel();
    expect(session.get().draft).toBe('');
    session.cancel();
    expect(await first).toBe('/quit');
    expect(session.get().mode).toBe('busy');
  });

  it('strips control characters from the draft', () => {
    const session = createTuiSession('');
    void session.prompt();
    session.setDraft('hello\r\n\u0007\u0085\u009bworld');
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

  it('deletes the last code point, not a UTF-16 unit', () => {
    const session = createTuiSession('');
    void session.prompt();
    session.setDraft('hi😀');
    session.deleteLast();
    expect(session.get().draft).toBe('hi');
  });
});
