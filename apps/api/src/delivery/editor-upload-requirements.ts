import type { SourceFile } from './games-store.js';

export type MissingFreshEditorFile = {
  path: 'EDITOR.json' | 'EDITOR.content.json';
  message: string;
};

export function missingFreshEditorFile(files: SourceFile[]): MissingFreshEditorFile | null {
  const editorJson = files.find((file) => file.path.trim() === 'EDITOR.json');
  if (!editorJson) {
    return {
      path: 'EDITOR.json',
      message: 'EDITOR.json is required for a new game — deliver the compiled editor contract before preview or publish',
    };
  }

  try {
    const definition = JSON.parse(editorJson.content) as { version?: unknown } | null;
    if (definition?.version === 2 && !files.some((file) => file.path.trim() === 'EDITOR.content.json')) {
      return {
        path: 'EDITOR.content.json',
        message:
          'EDITOR.content.json is required for an EditorKit v2 game — deliver the content document paired with EDITOR.json',
      };
    }
  } catch {
    // The authoritative editor parser reports malformed declarations in the gate.
  }

  return null;
}
