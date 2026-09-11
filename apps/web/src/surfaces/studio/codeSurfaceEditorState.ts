import { historyField } from '@codemirror/commands';
import { EditorState, type Extension } from '@codemirror/state';

export type CodeSurfaceEditorState = {
  doc: string;
  selection: unknown;
  history: unknown;
};

export function serializeCodeSurfaceEditorState(state: EditorState): CodeSurfaceEditorState {
  return state.toJSON({ history: historyField }) as CodeSurfaceEditorState;
}

function documentFromJson(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value) || !value.every((line) => typeof line === 'string')) return null;
  return value.join('\n');
}

export function restoreCodeSurfaceEditorState(
  saved: unknown,
  value: string,
  extensions: Extension,
  selection?: { anchor: number; head: number },
): EditorState {
  const config = { doc: value, selection, extensions };
  if (typeof saved !== 'object' || saved === null || documentFromJson((saved as { doc?: unknown }).doc) !== value) {
    return EditorState.create(config);
  }
  try {
    return EditorState.fromJSON(saved, config, { history: historyField });
  } catch {
    return EditorState.create(config);
  }
}
