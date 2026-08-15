import type { CodeSurfaceEditorState } from './codeSurfaceEditorState.js';

// Selection, drafts, and editor history kept across panel unmounts.

export type CodeSurfaceSessionState = {
  selected: string | null;
  drafts: Record<string, string>;
  editorStates?: Record<string, CodeSurfaceEditorState>;
};

const sessionStateBySlug = new Map<string, CodeSurfaceSessionState>();

export function getCodeSurfaceSessionState(slug: string): CodeSurfaceSessionState | undefined {
  return sessionStateBySlug.get(slug);
}

export function setCodeSurfaceSessionState(slug: string, state: CodeSurfaceSessionState): void {
  sessionStateBySlug.set(slug, state);
}

export function setCodeSurfaceEditorState(slug: string, path: string, state: CodeSurfaceEditorState): void {
  const current = sessionStateBySlug.get(slug) ?? { selected: null, drafts: {} };
  sessionStateBySlug.set(slug, {
    ...current,
    editorStates: { ...current.editorStates, [path]: state },
  });
}

// Test seam: the module-level cache outlives tests.
export function resetCodeSurfaceSessionState(): void {
  sessionStateBySlug.clear();
}
