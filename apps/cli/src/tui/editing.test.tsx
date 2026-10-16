import { expect, it, vi } from 'vitest';
import { screen } from './workspace-fixture.js';
import { PASTE_END, PASTE_ON, PASTE_START } from './keys.js';
import { cursorCell } from './composer.js';

function composer(text = '') {
  const view = screen(100, 28, 0, () => null, undefined, false);
  const answer = view.session.prompt();
  if (text) view.session.setDraft(text);
  const state = () => {
    const { draft, draftCursor } = view.session.get();
    return `${[...draft].slice(0, draftCursor).join('')}|${[...draft].slice(draftCursor).join('')}`;
  };
  return { view, answer, state };
}

it.each([
  ['Option+arrow (xterm)', '\u001b[1;3D', '\u001b[1;3C'],
  ['Option+arrow (Esc+ mode)', '\u001bb', '\u001bf'],
  ['Ctrl+arrow', '\u001b[1;5D', '\u001b[1;5C'],
])('moves by words with %s', async (_name, left, right) => {
  const { view, state } = composer('fix the build');
  await view.press(left);
  expect(state()).toBe('fix the |build');
  await view.press(left);
  expect(state()).toBe('fix |the build');
  await view.press(right);
  expect(state()).toBe('fix the| build');
});

it('jumps to line start and end with Ctrl+A/E and Home/End', async () => {
  const { view, state } = composer('hello world');
  await view.press('\u0001');
  expect(state()).toBe('|hello world');
  await view.press('\u001b[F');
  expect(state()).toBe('hello world|');
  await view.press('\u001b[H');
  expect(state()).toBe('|hello world');
  await view.press('\u0005');
  expect(state()).toBe('hello world|');
  await view.press('\u001bOH');
  expect(state()).toBe('|hello world');
  await view.press('\u001bOF');
  expect(state()).toBe('hello world|');
  expect(view.session.get().draft).toBe('hello world');
});

it('deletes words, lines and the next character, yanks the last cut, and undoes edits', async () => {
  const { view, state } = composer('please fix the build now');
  await view.press('\u0017');
  expect(state()).toBe('please fix the build |');
  await view.press('\u001b\u007f');
  expect(state()).toBe('please fix the |');
  await view.press('\u0019');
  expect(state()).toBe('please fix the build |');
  await view.press('\u0001\u001bd');
  expect(state()).toBe('| fix the build ');
  await view.press('\u001b[3~');
  expect(state()).toBe('|fix the build ');
  await view.press('\u000b');
  expect(state()).toBe('|');
  await view.press('\u001f');
  expect(state()).toBe('|fix the build ');
  await view.press('\u0005');
  await view.press('\u0015');
  expect(state()).toBe('|');
  await view.press('typed');
  await view.press('\u001f');
  expect(state()).toBe('|');
});

it('writes multi-line prompts with Option+Enter, Ctrl+J or a trailing backslash and submits them with Enter', async () => {
  const { view, answer, state } = composer('first');
  await view.press('\u001b\r');
  await view.press('second\\');
  await view.press('\r');
  await view.press('third');
  await view.press('\n');
  await view.press('fourth');
  expect(state()).toBe('first\nsecond\nthird\nfourth|');
  expect(view.frame()).toContain('first');
  expect(view.terminalOutput()).toContain(`  fourth${cursorCell(' ', false)}`);
  await view.press('\u001b[A');
  expect(state()).toBe('first\nsecond\nthird|\nfourth');
  await view.press('\r');
  expect(await answer).toBe('first\nsecond\nthird\nfourth');
});

it('moves between draft lines before recalling history', async () => {
  const { view, state } = composer();
  view.session.setDraft('older prompt');
  view.session.submit();
  void view.session.prompt();
  view.session.setDraft('one\ntwo');
  await view.press('\u001b[A');
  expect(state()).toBe('one|\ntwo');
  await view.press('\u001b[A');
  expect(view.session.get().draft).toBe('older prompt');
});

it('keeps pasted line breaks in the draft instead of submitting', async () => {
  const { view, state } = composer();
  expect(view.terminalOutput()).toContain(PASTE_ON);
  await view.press(PASTE_START);
  await view.press('line one');
  await view.press('\r');
  await view.press('line two\r\nline three');
  await view.press(PASTE_END);
  expect(view.session.get().mode).toBe('prompt');
  expect(state()).toBe('line one\nline two\nline three|');
});

it('searches sent prompts with Ctrl+R and accepts a match into the draft', async () => {
  const { view, state } = composer();
  for (const text of ['deploy to staging', 'fix the jump', 'deploy to prod']) {
    view.session.setDraft(text);
    view.session.submit();
    void view.session.prompt();
  }
  await view.press('\u0012');
  await view.press('deploy');
  expect(view.frame()).toContain('search: deploy');
  expect(view.frame()).toContain('→ deploy to prod');
  await view.press('\u0012');
  expect(view.frame()).toContain('→ deploy to staging');
  await view.press('\r');
  expect(state()).toBe('deploy to staging|');
  expect(view.session.get().mode).toBe('prompt');
  await view.press('\u0012');
  await view.press('\u001b');
  expect(view.frame()).not.toContain('search:');
  expect(state()).toBe('deploy to staging|');
});

it('clears a typed draft with Ctrl+C before cancelling', async () => {
  const { view } = composer('half-written idea');
  await view.press('\u0003');
  expect(view.session.get()).toMatchObject({ mode: 'prompt', draft: '' });
});

it('applies the same editing keys in the follow-up composer during local work', async () => {
  const view = screen(100, 28, 0, () => null, undefined, false);
  view.session.setLocalTask('claude');
  view.session.setDraft('then run the tests');
  await view.press('\u0017');
  await view.press('\u001b[1;3D\u001b\r');
  expect(view.session.get()).toMatchObject({ draft: 'then run \nthe ', draftCursor: 10 });
});

it('keeps the shell prefix when deleting or jumping back to the line start', async () => {
  const { view, state } = composer('!echo value');
  await view.press('\u0015');
  expect(state()).toBe('!|');
  view.session.setDraft('!git status');
  await view.press('\u001b\u007f');
  await view.press('\u001b\u007f');
  expect(state()).toBe('!|');
  view.session.setDraft('!ls -la');
  await view.press('\u0001');
  expect(state()).toBe('!|ls -la');
});

it('does not undo into a prompt that was already sent', async () => {
  const { view, state } = composer();
  await view.press('hello');
  await view.press(' world');
  await view.press('\r');
  void view.session.prompt();
  await view.press('\u001f');
  expect(state()).toBe('|');
});

it('clears a typed follow-up with Ctrl+C before stopping the local task', async () => {
  const view = screen(100, 28, 0, () => null, undefined, false);
  view.session.setLocalTask('claude');
  view.session.setDraft('wait, also check');
  const stop = vi.spyOn(view.session, 'cancel').mockImplementation(() => {});
  await view.press('\u0003');
  expect(view.session.get().draft).toBe('');
  expect(stop).not.toHaveBeenCalled();
  await view.press('\u0003');
  expect(stop).toHaveBeenCalledOnce();
});

it('highlights the character under the cursor without shifting the text', async () => {
  const { view } = composer('fix the build');
  const row = () =>
    view
      .frame()
      .split('\n')
      .find((line) => line.includes('fix the'))!;
  const end = row();
  expect(end).toContain('fix the build ');
  await view.press('\u001b[1;3D');
  expect(row()).toBe(end);
  expect(view.terminalOutput()).toContain(`fix the ${cursorCell('b', false)}uild`);
  await view.press('\u0001');
  expect(row()).toBe(end);
  expect(view.terminalOutput()).toContain(`${cursorCell('f', false)}ix the build`);
});

it('keeps the cursor visible on a zero-width mark by highlighting it with its base character', async () => {
  const { view } = composer('cafe\u0301 ok');
  await view.press('\u0001');
  for (let i = 0; i < 4; i++) await view.press('\u001b[C');
  expect(view.session.get().draftCursor).toBe(4);
  expect(view.terminalOutput()).toContain(`caf${cursorCell('e\u0301', false)} ok`);
});
