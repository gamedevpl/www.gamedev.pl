export type DraftAction =
  | 'left'
  | 'right'
  | 'wordLeft'
  | 'wordRight'
  | 'home'
  | 'end'
  | 'lineUp'
  | 'lineDown'
  | 'backspace'
  | 'deleteForward'
  | 'deleteWordBack'
  | 'deleteWordForward'
  | 'killToStart'
  | 'killToEnd'
  | 'yank'
  | 'newline';

export type DraftEdit = { draft: string; cursor: number; killed?: string };

const WORD = /[\p{L}\p{N}_]/u;
const word = (ch: string | undefined) => ch !== undefined && WORD.test(ch);

export function wordStart(chars: string[], cursor: number): number {
  let i = cursor;
  while (i > 0 && !word(chars[i - 1])) i--;
  while (i > 0 && word(chars[i - 1])) i--;
  return i;
}

export function wordEnd(chars: string[], cursor: number): number {
  let i = cursor;
  while (i < chars.length && !word(chars[i])) i++;
  while (i < chars.length && word(chars[i])) i++;
  return i;
}

const lineStart = (chars: string[], cursor: number) => chars.lastIndexOf('\n', cursor - 1) + 1;
const lineEnd = (chars: string[], cursor: number) => {
  const next = chars.indexOf('\n', cursor);
  return next < 0 ? chars.length : next;
};

// Keeps typed control bytes out while preserving pasted line breaks.
export function cleanDraftText(text: string): string {
  let clean = '';
  for (const ch of text.replace(/\r\n?/g, '\n').replaceAll('\t', '  ')) {
    const code = ch.charCodeAt(0);
    if (ch === '\n' || (code >= 32 && code !== 127 && (code < 0x80 || code > 0x9f))) clean += ch;
  }
  return clean;
}

// Returns null when the action changes neither text nor cursor.
export function editDraft(draft: string, cursor: number, action: DraftAction, yank = ''): DraftEdit | null {
  const chars = [...draft];
  const at = Math.max(0, Math.min(chars.length, cursor));
  const move = (to: number): DraftEdit | null => (to === at ? null : { draft, cursor: to });
  const cut = (from: number, to: number): DraftEdit | null => {
    if (from === to) return null;
    const killed = chars.slice(from, to).join('');
    chars.splice(from, to - from);
    return { draft: chars.join(''), cursor: from, killed };
  };
  const insert = (text: string): DraftEdit | null => {
    if (!text) return null;
    const added = [...text];
    chars.splice(at, 0, ...added);
    return { draft: chars.join(''), cursor: at + added.length };
  };
  switch (action) {
    case 'left':
      return move(Math.max(0, at - 1));
    case 'right':
      return move(Math.min(chars.length, at + 1));
    case 'wordLeft':
      return move(wordStart(chars, at));
    case 'wordRight':
      return move(wordEnd(chars, at));
    case 'home':
      return move(lineStart(chars, at));
    case 'end':
      return move(lineEnd(chars, at));
    case 'lineUp': {
      const start = lineStart(chars, at);
      if (start === 0) return null;
      const above = lineStart(chars, start - 1);
      return move(Math.min(above + at - start, start - 1));
    }
    case 'lineDown': {
      const end = lineEnd(chars, at);
      if (end === chars.length) return null;
      return move(Math.min(end + 1 + at - lineStart(chars, at), lineEnd(chars, end + 1)));
    }
    case 'backspace': {
      const edit = cut(Math.max(0, at - 1), at);
      return edit && { draft: edit.draft, cursor: edit.cursor };
    }
    case 'deleteForward': {
      const edit = cut(at, Math.min(chars.length, at + 1));
      return edit && { draft: edit.draft, cursor: edit.cursor };
    }
    case 'deleteWordBack':
      return cut(wordStart(chars, at), at);
    case 'deleteWordForward':
      return cut(at, wordEnd(chars, at));
    case 'killToStart':
      return cut(lineStart(chars, at), at);
    case 'killToEnd': {
      // At a line end readline joins the next line instead.
      const end = lineEnd(chars, at);
      return cut(at, end === at ? Math.min(chars.length, at + 1) : end);
    }
    case 'yank':
      return insert(yank);
    case 'newline':
      return insert('\n');
  }
}
