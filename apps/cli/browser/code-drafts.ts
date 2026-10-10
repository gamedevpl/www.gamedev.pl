import type { CodeFile } from './code-api.js';
import type { CodeSurfaceEditorState } from '../../web/src/surfaces/studio/codeSurfaceEditorState.js';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Draft = { content: string; base: CodeFile; editor?: CodeSurfaceEditorState };
export type Workspace = { drafts: Map<string, Draft>; selected: string };
export function reconcileCodeDrafts(workspace: Workspace, files: CodeFile[]) {
  const present = new Set(files.map((file) => file.path));
  for (const [path, draft] of workspace.drafts)
    if (!present.has(path) && draft.content === draft.base.content) workspace.drafts.delete(path);
  for (const file of files) {
    const draft = workspace.drafts.get(file.path);
    if (!draft || (draft.content === draft.base.content && draft.base.version !== file.version))
      workspace.drafts.set(file.path, { content: file.content, base: file });
  }
  if (!workspace.drafts.has(workspace.selected))
    workspace.selected =
      files.find((file) => !file.readOnly && file.path.endsWith('/game.ts'))?.path ??
      files.find((file) => !file.readOnly)?.path ??
      '';
}
const key = 'play-code-drafts';
function validDraft(value: unknown): value is Draft {
  if (typeof value !== 'object' || !value) return false;
  const draft = value as Draft;
  const base = draft.base;
  return (
    typeof draft.content === 'string' &&
    typeof base === 'object' &&
    Boolean(base) &&
    typeof base.path === 'string' &&
    typeof base.content === 'string' &&
    typeof base.version === 'string' &&
    typeof base.revision === 'string' &&
    typeof base.readOnly === 'boolean'
  );
}
export function loadCodeDrafts(): Map<string, Workspace> {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? '[]') as [
      string,
      { selected: string; drafts: [string, Draft][] },
    ][];
    return new Map(
      stored.map(([id, workspace]) => {
        if (typeof id !== 'string' || typeof workspace.selected !== 'string') throw Error('Invalid draft backup');
        const drafts = new Map(
          workspace.drafts.filter(([path, draft]) => typeof path === 'string' && validDraft(draft)),
        );
        return [id, { selected: workspace.selected, drafts }];
      }),
    );
  } catch {
    return new Map();
  }
}
export function persistCodeDrafts(workspaces: Map<string, Workspace>): boolean {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify(
        [...workspaces].map(([id, workspace]) => [
          id,
          {
            selected: workspace.selected,
            drafts: [...workspace.drafts].filter(([, draft]) => draft.content !== draft.base.content),
          },
        ]),
      ),
    );
    return true;
  } catch {
    return false;
  }
}
export function hasCodeDrafts(workspaces: Map<string, Workspace>): boolean {
  return [...workspaces.values()].some((workspace) =>
    [...workspace.drafts.values()].some((draft) => draft.content !== draft.base.content),
  );
}

export function useCodeDrafts() {
  const [initial] = useState(loadCodeDrafts);
  const workspaces = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [backupWarning, setBackupWarning] = useState('');
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    setBackupWarning(
      persistCodeDrafts(workspaces.current)
        ? ''
        : 'Draft backup is unavailable. Copy your changes before closing this tab.',
    );
  }, []);
  const persist = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 250);
  }, [flush]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (!hasCodeDrafts(workspaces.current)) return;
      flush();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('pagehide', flush);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);
  return { workspaces, persist, backupWarning };
}
