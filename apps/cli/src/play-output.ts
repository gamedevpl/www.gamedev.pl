import { closeSync, constants, fstatSync, lstatSync, openSync } from 'node:fs';
import { sanitizeEventPayload, stripTerminalControls } from './ansi.js';
import type { SessionController, SessionState } from './session-controller.js';

export function playOutputText(text: string): string {
  return sanitizeEventPayload(stripTerminalControls(text), Infinity)
    .replace(/gdpl_(?:oat|pat)_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[redacted]')
    .replace(/(https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/[^\s#]*)#[a-f0-9]{64}/gi, '$1#[redacted]')
    .slice(0, 2000);
}

export function openPlayLog(path: string): number {
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      lstatSync(path).isSymbolicLink() ||
      stat.nlink !== 1 ||
      (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0))
    )
      throw Error('Play log must be an owner-only regular file.');
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

export function startPlayOutput(session: SessionController, write: (line: string) => void): () => void {
  let previous = session.get();
  let activity = '';
  let promptId = -1;
  let ended = false;
  let lastToolActivityAt = -Infinity;
  let pendingToolActivity = '';
  let toolTimer: ReturnType<typeof setTimeout> | undefined;
  const show = (text: string) => {
    const safe = playOutputText(text);
    if (safe) write(`[${new Date().toISOString()}] ${safe}\n`);
  };
  const clearToolActivity = () => {
    clearTimeout(toolTimer);
    toolTimer = undefined;
    pendingToolActivity = '';
  };
  const showToolActivity = () => {
    toolTimer = undefined;
    if (pendingToolActivity && session.get().mode === 'busy' && !ended) {
      show(`Activity: ${pendingToolActivity}`);
      lastToolActivityAt = Date.now();
    }
    pendingToolActivity = '';
  };
  const showActivity = (text: string) => {
    const tool =
      /^(?:[\w-]+ [·▸] )?(?:Running a shell command|Tool:|Waiting for model response|Task started|✓ |Edited:)/.test(
        text,
      );
    if (!tool) {
      clearToolActivity();
      show(`Activity: ${text}`);
      return;
    }
    pendingToolActivity = text;
    const remaining = 10_000 - (Date.now() - lastToolActivityAt);
    if (remaining <= 0) showToolActivity();
    else toolTimer ??= setTimeout(showToolActivity, remaining);
  };
  const observe = (state: SessionState) => {
    const added = state.lines.slice(previous.lines.length);
    const restored = added[0] === 'Previous conversation (local history):' && added.at(-1) === 'Current session:';
    for (const line of restored ? [] : added) show(line);
    if (state.localTask !== previous.localTask) {
      clearToolActivity();
      lastToolActivityAt = -Infinity;
      show(state.localTask ? `Agent started: ${state.localTask}` : `Agent task ended: ${previous.localTask}`);
    }
    if (state.mode === 'busy' && state.activity && state.activity !== activity) {
      showActivity(state.activity);
      activity = state.activity;
    }
    if (state.queued.length !== previous.queued.length && state.queued.length) {
      show(`Queued follow-ups: ${state.queued.length}`);
    }
    if (state.mode !== 'busy' && state.promptId !== promptId) {
      clearToolActivity();
      promptId = state.promptId;
      activity = '';
      show(
        state.question || state.choices.length
          ? `Answer in Play: ${state.question || 'Choose an option'}${state.choices.length ? ` (${state.choices.join(' / ')})` : ''}`
          : 'Ready for your next request in Play.',
      );
    }
    previous = state;
  };
  const unsubscribe = session.subscribe(observe);
  return () => {
    if (ended) return;
    ended = true;
    clearToolActivity();
    unsubscribe();
    show('Play session ended.');
  };
}
