// @vitest-environment jsdom

import { history, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { restoreCodeSurfaceEditorState, serializeCodeSurfaceEditorState } from './codeSurfaceEditorState.js';

function applyChange(state: EditorState, from: number, to: number, insert: string): EditorState {
  return state.update({ changes: { from, to, insert } }).state;
}

describe('code surface editor state', () => {
  it('restores CodeMirror history for the current document', () => {
    const original = 'const color = "#fff";';
    const edited = 'const color = "#00e4ac";';
    const state = applyChange(EditorState.create({ doc: original, extensions: [history()] }), 15, 19, '#00e4ac');
    const saved = serializeCodeSurfaceEditorState(state);

    let restored = restoreCodeSurfaceEditorState(saved, edited, [history()]);
    expect(undoDepth(restored)).toBe(1);
    expect(undo({ state: restored, dispatch: (transaction) => (restored = transaction.state) })).toBe(true);
    expect(restored.doc.toString()).toBe(original);
  });

  it('drops stale history when the document no longer matches', () => {
    const state = EditorState.create({ doc: 'old', extensions: [history()] });
    const saved = serializeCodeSurfaceEditorState(applyChange(state, 3, 3, '!'));

    const restored = restoreCodeSurfaceEditorState(saved, 'new', [history()]);
    expect(undoDepth(restored)).toBe(0);
    expect(restored.doc.toString()).toBe('new');
  });
});
