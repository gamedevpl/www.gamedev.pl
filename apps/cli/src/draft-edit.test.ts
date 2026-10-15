import { expect, it } from 'vitest';
import { cleanDraftText, editDraft } from './draft-edit.js';

const at = (text: string) => {
  const [before = '', after = ''] = text.split('|');
  return { draft: before + after, cursor: [...before].length };
};
const apply = (text: string, action: Parameters<typeof editDraft>[2], yank?: string) => {
  const { draft, cursor } = at(text);
  const edit = editDraft(draft, cursor, action, yank);
  return (
    edit && {
      text: `${[...edit.draft].slice(0, edit.cursor).join('')}|${[...edit.draft].slice(edit.cursor).join('')}`,
      killed: edit.killed,
    }
  );
};

it('moves by words across punctuation and Polish letters', () => {
  expect(apply('zażółć gęślą| jaźń', 'wordLeft')?.text).toBe('zażółć |gęślą jaźń');
  expect(apply('fix src/tui/|app.tsx now', 'wordLeft')?.text).toBe('fix src/|tui/app.tsx now');
  expect(apply('fix |src/tui', 'wordRight')?.text).toBe('fix src|/tui');
  expect(apply('|abc', 'wordLeft')).toBeNull();
});

it('deletes words and lines into the kill buffer and yanks them back', () => {
  expect(apply('send the| file', 'deleteWordBack')).toEqual({ text: 'send | file', killed: 'the' });
  expect(apply('send |the file', 'deleteWordForward')).toEqual({ text: 'send | file', killed: 'the' });
  expect(apply('one\ntwo |three', 'killToStart')).toEqual({ text: 'one\n|three', killed: 'two ' });
  expect(apply('one |two\nthree', 'killToEnd')).toEqual({ text: 'one |\nthree', killed: 'two' });
  expect(apply('one|\ntwo', 'killToEnd')).toEqual({ text: 'one|two', killed: '\n' });
  expect(apply('a | c', 'yank', 'b')?.text).toBe('a b| c');
  expect(apply('ab|c', 'deleteForward')?.text).toBe('ab|');
});

it('moves within and between lines, keeping the column', () => {
  expect(apply('first line\nse|cond', 'lineUp')?.text).toBe('fi|rst line\nsecond');
  expect(apply('ab\nlonger|', 'lineUp')?.text).toBe('ab|\nlonger');
  expect(apply('first| line\nx', 'lineDown')?.text).toBe('first line\nx|');
  expect(apply('only| line', 'lineUp')).toBeNull();
  expect(apply('one\ntw|o', 'home')?.text).toBe('one\n|two');
  expect(apply('o|ne\ntwo', 'end')?.text).toBe('one|\ntwo');
});

it('keeps pasted line breaks and drops other control bytes', () => {
  expect(cleanDraftText('a\r\nb\rc\td\u0007\u009b')).toBe('a\nb\nc  d');
});

it('never moves or deletes across the protected prefix', () => {
  const floor = (text: string, action: Parameters<typeof editDraft>[2]) => {
    const { draft, cursor } = at(text);
    const edit = editDraft(draft, cursor, action, '', 1);
    return edit && `${[...edit.draft].slice(0, edit.cursor).join('')}|${[...edit.draft].slice(edit.cursor).join('')}`;
  };
  expect(floor('!echo value|', 'killToStart')).toBe('!|');
  expect(floor('!ls|', 'deleteWordBack')).toBe('!|');
  expect(floor('!ls -la|', 'home')).toBe('!|ls -la');
  expect(floor('!|ls', 'backspace')).toBeNull();
  expect(floor('!|ls', 'wordLeft')).toBeNull();
});
