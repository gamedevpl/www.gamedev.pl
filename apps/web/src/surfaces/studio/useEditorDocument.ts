import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { putEditorDraft, type EditorContentDoc, type StudioApiError } from '../../studioApi.js';
import { recordEditorStep } from '../../visitTelemetry.js';

export type EditorDocumentSaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';

type EditorDocumentOptions = {
  slug: string;
  onPush?: (content: EditorContentDoc) => void;
  autosaveMs?: number;
};

export function useEditorDocument({ slug, onPush, autosaveMs = 1500 }: EditorDocumentOptions) {
  const [content, setContentState] = useState<EditorContentDoc>({});
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<EditorDocumentSaveState>('clean');
  const [saveProblems, setSaveProblems] = useState<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const timerRef = useRef<number | null>(null);
  const tailRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const pastRef = useRef<EditorContentDoc[]>([]);
  const futureRef = useRef<EditorContentDoc[]>([]);

  const refreshHistory = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const setContent: Dispatch<SetStateAction<EditorContentDoc>> = useCallback(
    (nextValue) => {
      setContentState((current) => {
        const next = typeof nextValue === 'function' ? nextValue(current) : nextValue;
        if (next !== current) {
          pastRef.current = [...pastRef.current.slice(-49), current];
          futureRef.current = [];
          refreshHistory();
        }
        return next;
      });
    },
    [refreshHistory],
  );

  const reset = useCallback(
    (next: EditorContentDoc, nextRevision: number, unsaved = false) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setContentState(next);
      contentRef.current = next;
      setRevision(nextRevision);
      revisionRef.current = nextRevision;
      pastRef.current = [];
      futureRef.current = [];
      refreshHistory();
      setSaveProblems([]);
      setSaveState(unsaved ? 'dirty' : 'clean');
    },
    [refreshHistory],
  );

  const writeDraft = useCallback(
    async (overwrite: boolean): Promise<boolean> => {
      setSaveState('saving');
      setSaveProblems([]);
      const sent = contentRef.current;
      try {
        const saved = await putEditorDraft(slug, sent, overwrite ? undefined : revisionRef.current);
        setRevision(saved.revision);
        revisionRef.current = saved.revision;
        // An edit made in flight is not what the server holds.
        setSaveState(contentRef.current === sent ? 'saved' : 'dirty');
        recordEditorStep('draft_saved');
        return true;
      } catch (error) {
        const status = (error as StudioApiError).status;
        if (status === 409) setSaveState('conflict');
        else {
          setSaveState('error');
          const problems = (error as StudioApiError).problems;
          setSaveProblems(problems && problems.length > 0 ? problems : [(error as Error).message]);
        }
        return false;
      }
    },
    [slug],
  );

  // Every save joins the tail, so none of them race the revision.
  const saveNow = useCallback(
    (overwrite = false): Promise<boolean> => {
      const attempt = tailRef.current.then(() => writeDraft(overwrite));
      tailRef.current = attempt.catch(() => false);
      return attempt;
    },
    [writeDraft],
  );

  const scheduleSave = useCallback(() => {
    setSaveState('dirty');
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void saveNow();
    }, autosaveMs);
  }, [autosaveMs, saveNow]);

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (!previous) return false;
    const current = contentRef.current;
    futureRef.current = [...futureRef.current.slice(-49), current];
    setContentState(previous);
    contentRef.current = previous;
    onPush?.(previous);
    scheduleSave();
    refreshHistory();
    recordEditorStep('undo_used');
    return true;
  }, [onPush, refreshHistory, scheduleSave]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return false;
    const current = contentRef.current;
    pastRef.current = [...pastRef.current.slice(-49), current];
    setContentState(next);
    contentRef.current = next;
    onPush?.(next);
    scheduleSave();
    refreshHistory();
    return true;
  }, [onPush, refreshHistory, scheduleSave]);

  const markError = useCallback((error: unknown) => {
    setSaveState('error');
    const typed = error as StudioApiError;
    setSaveProblems(
      typed.problems && typed.problems.length > 0
        ? typed.problems
        : [error instanceof Error ? error.message : String(error)],
    );
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return {
    content,
    setContent,
    contentRef,
    revision,
    saveState,
    saveProblems,
    saveNow,
    scheduleSave,
    reset,
    undo,
    redo,
    canUndo,
    canRedo,
    markError,
  };
}
