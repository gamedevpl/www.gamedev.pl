import { describe, expect, it, vi } from 'vitest';
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

  it('forgets a stopped preview and can clear one when the checkout changes', () => {
    const session = createTuiSession('');
    session.writeLine('live preview while claude edits: http://127.0.0.1:64897/preview/');
    expect(session.get().previewUrl).toBe('http://127.0.0.1:64897/preview/');
    session.writeLine('local preview stopped');
    expect(session.get().previewUrl).toBe('');

    session.writeLine('local live preview: http://127.0.0.1:50000/next/');
    session.clearPreview();
    expect(session.get().previewUrl).toBe('');
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

  it('walks prompt history with prev/next', async () => {
    const session = createTuiSession('');
    const first = session.prompt();
    session.setDraft('one');
    session.submit();
    await first;
    const second = session.prompt();
    session.setDraft('two');
    session.submit();
    await second;
    void session.prompt();
    session.historyPrev();
    expect(session.get().draft).toBe('two');
    session.historyPrev();
    expect(session.get().draft).toBe('one');
    session.historyNext();
    expect(session.get().draft).toBe('two');
    session.historyNext();
    expect(session.get().draft).toBe('');
  });

  it('deletes the last code point, not a UTF-16 unit', () => {
    const session = createTuiSession('');
    void session.prompt();
    session.setDraft('hi😀');
    session.deleteLast();
    expect(session.get().draft).toBe('hi');
  });

  it('moves through code points and edits at the cursor', () => {
    const session = createTuiSession('');
    void session.prompt();
    session.setDraft('a😀c');
    session.moveDraftCursor(-1);
    session.insertDraft('b');
    expect(session.get()).toMatchObject({ draft: 'a😀bc', draftCursor: 3 });
    session.deleteLast();
    expect(session.get()).toMatchObject({ draft: 'a😀c', draftCursor: 2 });
    session.moveDraftCursor(-20);
    session.deleteLast();
    expect(session.get()).toMatchObject({ draft: 'a😀c', draftCursor: 0 });
    session.moveDraftCursor(20);
    expect(session.get().draftCursor).toBe(3);
  });
});

it('queues a follow-up while working and does not use it to answer a choice', async () => {
  const session = createTuiSession('');
  session.setLocalTask('codex');
  session.insertDraft('keep the camera');
  session.queueDraft();
  expect(session.get().queued).toEqual(['keep the camera']);
  const choice = session.prompt(['Deliver', 'Keep editing']);
  session.movePick(1);
  session.submit();
  expect(await choice).toBe('Keep editing');
  expect(await session.prompt()).toBe('keep the camera');
  expect(session.get().queued).toEqual([]);
  session.close();
});

it('preserves an unfinished follow-up through a choice and clears queued work on stop', async () => {
  const stop = vi.fn();
  const session = createTuiSession('', stop);
  session.setLocalTask('codex');
  session.insertDraft('first');
  session.queueDraft();
  session.insertDraft('unfinished');
  const choice = session.prompt(['Keep editing']);
  session.submit();
  await choice;
  expect(await session.prompt()).toBe('first');
  const prompt = session.prompt();
  expect(session.get().draft).toBe('unfinished');
  session.submit();
  await prompt;
  session.insertDraft('do not run');
  session.queueDraft();
  session.cancel();
  expect(session.get().queued).toEqual([]);
  expect(stop).toHaveBeenCalledOnce();
  session.close();
});

it('keeps queued work and unfinished drafts out of a model ID question', async () => {
  const session = createTuiSession('');
  session.setLocalTask('codex');
  session.insertDraft('add ramps');
  session.queueDraft();
  session.insertDraft('unfinished request');
  const model = session.prompt([], 'Model ID');
  expect(session.get().draft).toBe('');
  expect(session.get().queued).toEqual(['add ramps']);
  session.insertDraft('my-model');
  session.submit();
  expect(await model).toBe('my-model');
  expect(await session.prompt()).toBe('add ramps');
  const next = session.prompt();
  expect(session.get().draft).toBe('unfinished request');
  session.close();
  await next;
});

it('requires agent acknowledgement, prevents duplicate sends, and preserves edits typed while sending', async () => {
  const session = createTuiSession('');
  session.setLocalTask('codex');
  let ack!: () => void;
  const send = vi.fn(
    () =>
      new Promise<void>((r) => {
        ack = r;
      }),
  );
  session.setSteering(send);
  session.setDraft('correction');
  const pending = session.sendDraft();
  await session.sendDraft();
  session.queueDraft();
  expect(send).toHaveBeenCalledTimes(1);
  expect(session.get().queued).toEqual([]);
  expect(session.get().draft).toBe('correction');
  session.setDraft('another idea');
  ack();
  await pending;
  expect(session.get().draft).toBe('another idea');
  expect(session.get().sendStatus).toContain('Accepted');
  expect(session.savedHistory().prompts).toContain('correction');
});
it('keeps refused messages and separates sending now from queued work', async () => {
  const session = createTuiSession('');
  session.setLocalTask('codex');
  session.setSteering(async () => {
    throw new Error('Turn ended');
  });
  session.setDraft('correction');
  await session.sendDraft();
  expect(session.get().draft).toBe('correction');
  expect(session.get().sendStatus).toContain('Turn ended');
  expect(session.savedHistory().prompts).toEqual(['correction']);
  session.queueDraft();
  expect(session.get().queued).toEqual(['correction']);
  session.setSteering(undefined);
  expect(session.get().canSteer).toBe(false);
});
it('does not repeat an acknowledged message after the task ends during delivery', async () => {
  const session = createTuiSession('');
  session.setLocalTask('codex');
  let ack!: () => void;
  session.setSteering(
    () =>
      new Promise<void>((r) => {
        ack = r;
      }),
  );
  session.setDraft('correction');
  const sending = session.sendDraft();
  session.setSteering(undefined);
  session.setLocalTask('');
  const next = session.prompt();
  ack();
  await sending;
  expect(session.get().draft).toBe('');
  expect(session.get().queued).toEqual([]);
  session.close();
  await next;
});

it('retains a failed in-flight message without overwriting a newer draft', async () => {
  const session = createTuiSession('');
  session.setLocalTask('muse');
  let reject!: (error: Error) => void;
  session.setSteering(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  session.setDraft('original correction');
  const sending = session.sendDraft();
  session.setDraft('newer unfinished request');
  reject(new Error('Delivery outcome unknown'));
  await sending;
  expect(session.get().draft).toBe('newer unfinished request');
  expect(session.get().queued).toEqual([]);
  expect(session.savedHistory().lines).toContain('› [delivery not confirmed] original correction');
  expect(session.savedHistory().prompts).toContain('original correction');
  const prompt = session.prompt();
  session.historyPrev();
  expect(session.get().draft).toBe('original correction');
  session.historyNext();
  expect(session.get().draft).toBe('newer unfinished request');
  session.close();
  await prompt;
});
