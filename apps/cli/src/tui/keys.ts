import { useLayoutEffect } from 'react';
import { useStdin, useStdout, type Key } from 'ink';
import type { DraftAction } from '../draft-edit.js';

export type EditKey = DraftAction | 'undo';
export const PASTE_ON = '\u001b[?2004h';
export const PASTE_OFF = '\u001b[?2004l';
export const PASTE_START = '\u001b[200~';
export const PASTE_END = '\u001b[201~';

// Terminals disagree on modified keys, so each action lists every common encoding.
const SEQUENCES: Record<string, EditKey> = {
  '\u001bb': 'wordLeft',
  '\u001b[1;3D': 'wordLeft',
  '\u001b[1;5D': 'wordLeft',
  '\u001b\u001b[D': 'wordLeft',
  '\u001bf': 'wordRight',
  '\u001b[1;3C': 'wordRight',
  '\u001b[1;5C': 'wordRight',
  '\u001b\u001b[C': 'wordRight',
  '\u0001': 'home',
  '\u001b[H': 'home',
  '\u001b[1~': 'home',
  '\u001b[7~': 'home',
  '\u001bOH': 'home',
  '\u0005': 'end',
  '\u001b[F': 'end',
  '\u001b[4~': 'end',
  '\u001b[8~': 'end',
  '\u001bOF': 'end',
  '\u001b[3~': 'deleteForward',
  '\u0017': 'deleteWordBack',
  '\u001b\u007f': 'deleteWordBack',
  '\u001b\b': 'deleteWordBack',
  '\u001bd': 'deleteWordForward',
  '\u001b[3;3~': 'deleteWordForward',
  '\u001b[3;5~': 'deleteWordForward',
  '\u0015': 'killToStart',
  '\u000b': 'killToEnd',
  '\u0019': 'yank',
  '\u001f': 'undo',
  '\u001b\r': 'newline',
  '\u001b\n': 'newline',
  '\n': 'newline',
  '\u001b[13;2u': 'newline',
  '\u001b[13;3u': 'newline',
  '\u001b[27;2;13~': 'newline',
};

export function editKey(raw: string, key: Key): EditKey | null {
  const mapped = SEQUENCES[raw];
  if (mapped) return mapped;
  if (key.leftArrow) return 'left';
  if (key.rightArrow) return 'right';
  // Ink reports both Backspace (DEL) and forward delete as `delete`.
  if (key.backspace || key.delete) return 'backspace';
  return null;
}

export function useBracketedPaste() {
  const { stdout } = useStdout();
  const { stdin } = useStdin();
  useLayoutEffect(() => {
    if (!stdout.isTTY || !stdin.isTTY) return;
    stdout.write(PASTE_ON);
    const release = () => {
      if (!stdout.writableEnded && !stdout.destroyed) stdout.write(PASTE_OFF);
    };
    process.once('exit', release);
    return () => {
      process.off('exit', release);
      release();
    };
  }, [stdin, stdout]);
}
