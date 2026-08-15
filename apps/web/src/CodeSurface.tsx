import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { CodeMirrorDiagnostic } from './CodeMirrorEditor.js';
import {
  CodeSurfaceApiError,
  deliverCodeSurface,
  fetchCodeSurfaceCompletion,
  fetchCodeSurfaceKitDeclaration,
  discardCodeSurfaceEdits,
  fetchCodeSurfaceSources,
  rebuildCodeSurfaceStage,
  stageCodeSurfaceFile,
  typecheckCodeSurface,
  type CodeSurfaceFile,
  type CodeSurfaceSources,
} from './codeSurfaceApi.js';
import { getCodeSurfaceSessionState, setCodeSurfaceSessionState } from './codeSurfaceSessionState.js';
import {
  createCodeSurfaceLanguageService,
  fromVfsPath,
  KIT_DECLARATION_PATH,
  toVfsPath,
  type CodeSurfaceLanguageService,
} from './codeSurfaceLanguageService.js';
import { type CodeLanguage, tokenizeLine } from './codeTokens.js';
import { declaredParamDefaultChanges, type DeclaredParamChange } from './editorJsonLiveDiff.js';
import { PixelIcon } from './PixelIcon.js';
import { fetchGameEditor, type EditorContentDoc, type EditorParamValue } from './studioApi.js';
import type { EditorContentPush } from './editorBridge.js';
import { recordCodeStep } from './visitTelemetry.js';

/**
 * The Code surface (creator-code-editing-execution-plan.md CE-06/07/08/09/13/15):
 * docked over the stage the way `EditorPanel` docks for Edit.
 *
 * Working-copy model (owner feedback 2026-08-11): edits autosave into the staging
 * buffer (MCP `stage` equivalent); the full-bleed stage auto-rebuilds after saves
 * settle; Publish delivers through the gate (MCP `submit_sources`); Discard clears
 * the owner's unsubmitted buffer. No separate "Stage it" click — that read as a
 * second save and hid that the buffer already held the working copy.
 *
 * CodeMirror 6 (CE-14) is a lazy route chunk. The read path (CE-07) never imports
 * it: a locked agent round gets `codeTokens.ts`. `CodeMirrorBoundary` falls back
 * to a plain `<textarea>` if the chunk fails to load.
 */

const LazyCodeMirrorEditor = lazy(() => import('./CodeMirrorEditor.js'));

/** Catches a lazy-chunk load failure and degrades to `fallback` — CE-14's own rule. */
class CodeMirrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Advisory only — degrading to the plain textarea is the whole point; nothing
    // else to do with the error, and it must never blank the panel.
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** `type-check.ts`'s `file:line: message` shape, back into a structured diagnostic. */
function parseDiagnostic(raw: string): { path: string; line: number; message: string } | null {
  const match = /^(.+?):(\d+): (.+)$/.exec(raw);
  if (!match) return null;
  return { path: match[1]!, line: Number(match[2]), message: match[3]! };
}

const AUTOSAVE_MS = 1500;
const TYPECHECK_DEBOUNCE_MS = 400;
/** Wait after the last successful stage write before arming a preview rebuild. */
const PREVIEW_DEBOUNCE_MS = 2_500;
/** Mirrors staged-preview.ts's STAGED_PREVIEW_MIN_GAP_MS: the floor between rebuilds. */
const STAGE_REBUILD_COOLDOWN_MS = 25_000;

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';
type RebuildState = 'idle' | 'pending' | 'cooling';
type DiscardState = 'idle' | 'discarding';

export type CodeSurfaceProps = {
  slug: string;
  onBack: () => void;
  /** Filled in by `StudioStage`; lets a live param edit reach the running game. */
  editorPushRef?: MutableRefObject<EditorContentPush | null>;
};

const LOCKED_DIRS = ['shared/', 'tools/'] as const;

function languageFor(path: string): CodeLanguage {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.md')) return 'markdown';
  return 'text';
}

function fileDotClass(file: CodeSurfaceFile): string {
  return file.stagedBy ? ` has-staged-edits is-staged-by-${file.stagedBy}` : '';
}

// GA-04: mirrors type-check.ts's own .ts filter.
function isTsPath(path: string): boolean {
  return path.endsWith('.ts') || path.endsWith('.tsx');
}

function markFileStaged(sources: CodeSurfaceSources, path: string, content: string): CodeSurfaceSources {
  const lines = content.split('\n').length;
  const bytes = new TextEncoder().encode(content).length;
  return {
    ...sources,
    files: sources.files.map((entry) =>
      entry.path === path
        ? {
            ...entry,
            content,
            stagedBy: 'owner',
            budget: entry.budget
              ? {
                  ...entry.budget,
                  lines,
                  bytes,
                  oversize: lines > entry.budget.maxLines || bytes > entry.budget.maxBytes,
                }
              : undefined,
          }
        : entry,
    ),
  };
}

export function CodeSurface({ slug, onBack, editorPushRef }: CodeSurfaceProps) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<CodeSurfaceSources | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => getCodeSurfaceSessionState(slug)?.selected ?? null);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => getCodeSurfaceSessionState(slug)?.drafts ?? {});
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [diagnostics, setDiagnostics] = useState<string[] | null>(null);
  const [rebuildState, setRebuildState] = useState<RebuildState>('idle');
  const [rebuildError, setRebuildError] = useState(false);
  const [discardState, setDiscardState] = useState<DiscardState>('idle');
  const [deliverState, setDeliverState] = useState<'idle' | 'delivering' | 'delivered'>('idle');
  const [deliverMessage, setDeliverMessage] = useState<string | null>(null);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  /** Briefly true after a live param push (§E tier 1) — separate from `saveState`. */
  const [livePush, setLivePush] = useState(false);

  const openedRecordedRef = useRef(false);
  const fileOpenedRecordedRef = useRef(new Set<string>());
  const filePickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const kitViewerBodyRef = useRef<HTMLPreElement | null>(null);
  /** One autosave timer per dirty path, not one shared timer — editing a second file
   * inside the debounce window must not cancel the first file's pending save. */
  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const typecheckTimerRef = useRef<number | null>(null);
  const livePushTimerRef = useRef<number | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const lastRebuildAtRef = useRef(0);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  /** The content doc believed live in the game now — lazy-fetched, kept current by pushes. */
  const liveContentRef = useRef<EditorContentDoc | null>(null);
  const liveContentPromiseRef = useRef<Promise<EditorContentDoc | null> | null>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  // GA-04: a ref, not state — languageServiceReady below signals it exists.
  const languageServiceRef = useRef<CodeSurfaceLanguageService | null>(null);
  const languageServiceInitRef = useRef(false);
  const [languageServiceReady, setLanguageServiceReady] = useState(false);
  // GA-09: cached for the kit read-only hop.
  const kitDeclarationRef = useRef<string | null>(null);
  const [pendingJump, setPendingJump] = useState<{ path: string; from: number; to: number } | null>(null);
  const [kitViewerLine, setKitViewerLine] = useState<number | null>(null);

  useEffect(() => {
    if (openedRecordedRef.current) return;
    openedRecordedRef.current = true;
    recordCodeStep('opened');
  }, []);

  useEffect(() => {
    // jsdom has no scrollIntoView — optional call, not just optional chaining.
    railRef.current?.querySelector('.code-surface-rail-item.is-active')?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [selected]);

  // GA-09: centers the jump target the moment the kit viewer opens.
  useEffect(() => {
    if (kitViewerLine === null) return;
    kitViewerBodyRef.current?.querySelector('.is-jump-target')?.scrollIntoView?.({ block: 'center' });
  }, [kitViewerLine]);

  const load = useCallback(
    (isInitialLoad: boolean) => {
      fetchCodeSurfaceSources(slug)
        .then((result) => {
          setSources(result);
          setLoadError(null);
          // Land on the game's entry module, not whatever sorts first alphabetically —
          // the server's sorted listing puts GAME.json ahead of game.ts, and a creator
          // opening "Code" came for the code, not the manifest.
          setSelected(
            (current) =>
              current ?? (result.files.some((f) => f.path === 'game.ts') ? 'game.ts' : (result.files[0]?.path ?? null)),
          );
          if (result.readOnly) recordCodeStep('read_only_agent');
        })
        .catch((error: unknown) => {
          // A background poll refresh failing (e.g. its own rate limit) must not blank
          // an already-loaded surface — only the initial load can put up the error
          // screen; a stale read-only view beats no view.
          if (!isInitialLoad) return;
          setLoadError(error instanceof CodeSurfaceApiError ? error.message : 'could not load sources');
        });
    },
    [slug],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // Watching an agent's files land live, while the buffer is locked (CE-08) — the same
  // polling cadence the read-only banner needs to stay current without a page reload.
  useEffect(() => {
    if (!sources?.readOnly) return undefined;
    const id = window.setInterval(() => load(false), 4_000);
    return () => window.clearInterval(id);
  }, [sources?.readOnly, load]);

  useEffect(() => {
    setCodeSurfaceSessionState(slug, { selected, drafts });
  }, [slug, selected, drafts]);

  useEffect(() => {
    if (!filePickerOpen) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setFilePickerOpen(false);
      filePickerTriggerRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [filePickerOpen]);

  // GA-09: Escape closes the kit viewer, like the file picker.
  useEffect(() => {
    if (kitViewerLine === null) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setKitViewerLine(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [kitViewerLine]);

  useEffect(
    () => () => {
      // Unmount flushes pending autosaves — direct calls, no setState after unmount.
      saveTimersRef.current.forEach((timer, path) => {
        window.clearTimeout(timer);
        const draft = draftsRef.current[path];
        if (draft !== undefined) {
          stageCodeSurfaceFile(slug, path, draft, { rebuild: false }).catch(() => {});
        }
      });
      saveTimersRef.current.clear();
      if (typecheckTimerRef.current !== null) window.clearTimeout(typecheckTimerRef.current);
      if (livePushTimerRef.current !== null) window.clearTimeout(livePushTimerRef.current);
      if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
      if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
    },
    [slug],
  );

  useEffect(() => {
    function onHide() {
      if (document.visibilityState !== 'hidden') return;
      saveTimersRef.current.forEach((_timer, path) => {
        const draft = draftsRef.current[path];
        if (draft !== undefined) {
          stageCodeSurfaceFile(slug, path, draft, { rebuild: false, keepalive: true }).catch(() => {});
        }
      });
    }
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [slug]);

  const editable = sources !== null && !sources.readOnly;

  // GA-04: keyed on editable/slug — avoids a re-fetch cleanup race.
  useEffect(() => {
    if (!editable || languageServiceInitRef.current) return undefined;
    const sourcesAtStart = sourcesRef.current;
    if (!sourcesAtStart) return undefined;
    languageServiceInitRef.current = true;
    let cancelled = false;
    const initialFiles = Object.fromEntries(
      sourcesAtStart.files
        .filter((entry) => isTsPath(entry.path))
        .map((entry) => [entry.path, draftsRef.current[entry.path] ?? entry.content]),
    );
    void (async () => {
      const kit = await fetchCodeSurfaceKitDeclaration(slug);
      if (cancelled) return;
      kitDeclarationRef.current = kit?.declaration ?? null;
      const service = await createCodeSurfaceLanguageService(initialFiles, kit?.declaration ?? null);
      if (cancelled) {
        service?.destroy();
        return;
      }
      languageServiceRef.current = service;
      setLanguageServiceReady(service !== null);
    })();
    return () => {
      cancelled = true;
    };
  }, [editable, slug]);

  // Slug change or unmount tears the worker down for a rebuild.
  useEffect(() => {
    return () => {
      languageServiceRef.current?.destroy();
      languageServiceRef.current = null;
      languageServiceInitRef.current = false;
      setLanguageServiceReady(false);
    };
  }, [slug]);

  const file = useMemo(() => sources?.files.find((entry) => entry.path === selected) ?? null, [sources, selected]);
  const content = selected !== null ? (drafts[selected] ?? file?.content ?? '') : '';

  // GA-05: memoized so a keystroke doesn't re-trigger the editor.
  const languageServiceForEditor = useMemo(() => {
    if (!languageServiceReady || !languageServiceRef.current || !file || !isTsPath(file.path)) return undefined;
    return { worker: languageServiceRef.current.worker, path: toVfsPath(file.path) };
  }, [languageServiceReady, file]);

  // GA-09: a cross-file jump, consumed once the target mounts.
  const initialSelectionForEditor = useMemo(() => {
    if (!pendingJump || pendingJump.path !== selected) return undefined;
    return { anchor: pendingJump.from, head: pendingJump.to };
  }, [pendingJump, selected]);

  // GA-09: this render's editor already read initialSelectionForEditor above.
  useEffect(() => {
    if (pendingJump && pendingJump.path === selected) setPendingJump(null);
  }, [pendingJump, selected]);

  /** Owner-staged paths plus local drafts that still differ — the working-copy set. */
  const changedPaths = useMemo(() => {
    if (!sources) return [] as string[];
    const paths = new Set<string>();
    for (const entry of sources.files) {
      if (entry.stagedBy === 'owner') paths.add(entry.path);
    }
    for (const [path, draft] of Object.entries(drafts)) {
      const base = sources.files.find((entry) => entry.path === path);
      if (base && draft !== base.content) paths.add(path);
      else if (!base) paths.add(path);
    }
    return [...paths];
  }, [sources, drafts]);

  const hasWorkingCopy = changedPaths.length > 0 || saveState === 'dirty' || saveState === 'saving';

  /** The budget meter fed by the live draft, not the last fetch — the counter has to
   * move as the creator types toward the ceiling, not jump on the next reload. */
  const liveBudget = useMemo(() => {
    const base = file?.budget;
    if (!base) return null;
    const lines = content.split('\n').length;
    const bytes = new TextEncoder().encode(content).length;
    return { ...base, lines, bytes, oversize: lines > base.maxLines || bytes > base.maxBytes };
  }, [file, content]);

  /** CE-11's diagnostics, reshaped for CodeMirror's gutter and scoped to the open file. */
  const cmDiagnostics = useMemo((): CodeMirrorDiagnostic[] => {
    if (!diagnostics || !selected) return [];
    return diagnostics
      .map(parseDiagnostic)
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.path === selected)
      .map((entry) => ({ line: entry.line, message: entry.message, severity: 'error' as const }));
  }, [diagnostics, selected]);

  function selectFile(path: string) {
    setSelected(path);
    setDiagnostics(null);
    if (!fileOpenedRecordedRef.current.has(path)) {
      fileOpenedRecordedRef.current.add(path);
      recordCodeStep('file_opened');
    }
  }

  // GA-09: switches tabs for a game file, opens the kit.
  function handleGotoDefinition(vfsPath: string, from: number, to: number) {
    const path = fromVfsPath(vfsPath);
    if (path === KIT_DECLARATION_PATH) {
      const declaration = kitDeclarationRef.current;
      if (!declaration) return;
      setKitViewerLine(declaration.slice(0, from).split('\n').length);
      return;
    }
    if (!sources?.files.some((entry) => entry.path === path)) return;
    setPendingJump({ path, from, to });
    selectFile(path);
  }

  // TA-02: the editor extension supplies the window, this supplies the call.
  function fetchGhostText(prefixWindow: string, suffixWindow: string, signal: AbortSignal): Promise<string> {
    // The prompt only knows TypeScript — other file types would get it wrong.
    if (!file || !isTsPath(file.path)) return Promise.resolve('');
    return fetchCodeSurfaceCompletion(slug, file.path, prefixWindow, suffixWindow, signal);
  }

  const schedulePreviewRebuild = useCallback(() => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    const arm = () => {
      previewTimerRef.current = null;
      const since = Date.now() - lastRebuildAtRef.current;
      if (since < STAGE_REBUILD_COOLDOWN_MS && lastRebuildAtRef.current > 0) {
        previewTimerRef.current = window.setTimeout(arm, STAGE_REBUILD_COOLDOWN_MS - since);
        return;
      }
      setRebuildError(false);
      setRebuildState('pending');
      void rebuildCodeSurfaceStage(slug)
        .then(() => {
          recordCodeStep('previewed');
          lastRebuildAtRef.current = Date.now();
          setRebuildState('cooling');
          cooldownTimerRef.current = window.setTimeout(() => {
            cooldownTimerRef.current = null;
            setRebuildState('idle');
          }, STAGE_REBUILD_COOLDOWN_MS);
        })
        .catch(() => {
          setRebuildError(true);
          setRebuildState('idle');
        });
    };
    previewTimerRef.current = window.setTimeout(arm, PREVIEW_DEBOUNCE_MS);
  }, [slug]);

  /** Returns whether the save actually landed — deliver must not proceed over a flush
   * that failed, or it ships a build missing the creator's last edit. */
  const saveNow = useCallback(
    async (path: string, value: string): Promise<boolean> => {
      setSaveState('saving');
      try {
        // Autosave writes the working copy only; preview rebuild is scheduled after
        // the write settles so the stage does not thrash on every keystroke.
        const result = await stageCodeSurfaceFile(slug, path, value, { rebuild: false });
        setSources((current) => {
          if (!current) return current;
          return { ...markFileStaged(current, path, value), staged: result.staged };
        });
        setSaveState('saved');
        recordCodeStep('edited');
        // GA-04: syncs siblings — tsSync() only covers the focused editor.
        if (isTsPath(path)) languageServiceRef.current?.updateFile(path, value);
        schedulePreviewRebuild();
        return true;
      } catch (error) {
        setSaveState('error');
        if (error instanceof CodeSurfaceApiError && error.code === 'agent_round') {
          // The buffer was live-locked out from under an in-progress edit — a real
          // conflict, not a transient network error, and CE-13's "never silent" rule
          // applies to it as much as to a stale-base overwrite.
          recordCodeStep('conflict_seen');
          setSources((current) => (current ? { ...current, readOnly: true, reason: 'agent_round' } : current));
        }
        return false;
      }
    },
    [slug, schedulePreviewRebuild],
  );

  /** Flushes every path with a pending autosave — not just the one currently open —
   * before deliver acts on the buffer. Returns false if any of them failed to save. */
  const flushPendingSaves = useCallback(async (): Promise<boolean> => {
    const pending = Array.from(saveTimersRef.current.entries());
    saveTimersRef.current.clear();
    for (const [, timer] of pending) window.clearTimeout(timer);
    if (pending.length === 0) return true;
    const results = await Promise.all(pending.map(([path]) => saveNow(path, draftsRef.current[path] ?? '')));
    return results.every(Boolean);
  }, [saveNow]);

  const runTypecheck = useCallback(async () => {
    const overlay = Object.entries(draftsRef.current).map(([path, draftContent]) => ({ path, content: draftContent }));
    try {
      const result = await typecheckCodeSurface(slug, overlay);
      setDiagnostics(result.ok ? [] : result.errors);
      recordCodeStep('typechecked');
    } catch {
      // Advisory only — a failed typecheck round trip must not block editing.
    }
  }, [slug]);

  /** Fetches and caches the base content doc a live param push merges onto. */
  const loadLiveContent = useCallback((): Promise<EditorContentDoc | null> => {
    if (liveContentRef.current) return Promise.resolve(liveContentRef.current);
    liveContentPromiseRef.current ??= fetchGameEditor(slug)
      .then((state) => state.draft?.content ?? state.content ?? null)
      .catch(() => null);
    return liveContentPromiseRef.current;
  }, [slug]);

  /** §E tier 1: a declared param default changed — push it live, no rebuild. */
  const pushLiveParamChanges = useCallback(
    async (changes: DeclaredParamChange[]) => {
      const push = editorPushRef?.current;
      if (!push) return;
      const fetched = await loadLiveContent();
      // A concurrent push may have updated the ref during this await — merge onto that.
      const base = liveContentRef.current ?? fetched;
      if (!base) return;
      const prevParams = base.params;
      const params: Record<string, EditorParamValue> = {
        ...(prevParams && !Array.isArray(prevParams) ? prevParams : {}),
      };
      for (const change of changes) params[change.key] = change.value as EditorParamValue;
      const merged: EditorContentDoc = { ...base, params };
      liveContentRef.current = merged;
      push(merged);
      setLivePush(true);
      if (livePushTimerRef.current !== null) window.clearTimeout(livePushTimerRef.current);
      livePushTimerRef.current = window.setTimeout(() => setLivePush(false), 1_500);
    },
    [editorPushRef, loadLiveContent],
  );

  function onEdit(value: string) {
    const path = selected;
    if (!path) return;
    if (path === 'EDITOR.json') {
      const changes = declaredParamDefaultChanges(content, value);
      if (changes) void pushLiveParamChanges(changes);
    }
    setDrafts((prev) => ({ ...prev, [path]: value }));
    setSaveState('dirty');
    setDeliverState((current) => (current === 'delivered' ? 'idle' : current));
    setDeliverMessage(null);
    const existing = saveTimersRef.current.get(path);
    if (existing !== undefined) window.clearTimeout(existing);
    saveTimersRef.current.set(
      path,
      window.setTimeout(() => {
        saveTimersRef.current.delete(path);
        void saveNow(path, value);
      }, AUTOSAVE_MS),
    );
    if (typecheckTimerRef.current !== null) window.clearTimeout(typecheckTimerRef.current);
    typecheckTimerRef.current = window.setTimeout(() => {
      void runTypecheck();
    }, TYPECHECK_DEBOUNCE_MS);
  }

  async function discardWorkingCopy() {
    if (discardState === 'discarding') return;
    setDiscardState('discarding');
    setDeliverMessage(null);
    // Cancel pending saves — discard must not flush them into the buffer first.
    saveTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    saveTimersRef.current.clear();
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    try {
      await discardCodeSurfaceEdits(slug);
      setDrafts({});
      setSaveState('clean');
      setDiagnostics(null);
      setDeliverState('idle');
      const result = await fetchCodeSurfaceSources(slug);
      setSources(result);
      schedulePreviewRebuild();
    } catch (error) {
      setDeliverMessage(error instanceof CodeSurfaceApiError ? error.message : t('studioPanel.code.discardError'));
    } finally {
      setDiscardState('idle');
    }
  }

  async function deliver() {
    setDeliverState('delivering');
    setDeliverMessage(null);
    try {
      const flushed = await flushPendingSaves();
      if (!flushed) {
        setDeliverState('idle');
        setDeliverMessage(t('studioPanel.code.deliverError'));
        return;
      }
      // Publish click is the attestation; API still gets attestation:true.
      const outcome = await deliverCodeSurface(slug, 'publish');
      if (outcome.accepted) {
        recordCodeStep('delivered');
        setDeliverState('delivered');
        setDeliverMessage(t('studioPanel.code.deliverSuccess'));
        setDrafts({});
        setSaveState('clean');
        // Delivery clears the staging buffer server-side — refresh the rail dots.
        load(false);
      } else {
        setDeliverState('idle');
        setDeliverMessage(t('studioPanel.code.deliverRefused'));
      }
    } catch (error) {
      setDeliverState('idle');
      setDeliverMessage(error instanceof CodeSurfaceApiError ? error.message : t('studioPanel.code.deliverError'));
    }
  }

  const workingCopyLabel = (() => {
    if (saveState === 'dirty') return t('studioPanel.code.saveState.dirty');
    if (saveState === 'saving') return t('studioPanel.code.saveState.saving');
    if (saveState === 'error') return t('studioPanel.code.saveState.error');
    if (rebuildState === 'pending') return t('studioPanel.code.previewUpdating');
    if (changedPaths.length > 0) {
      return t('studioPanel.code.workingCopy.changed', { count: changedPaths.length });
    }
    if (rebuildState === 'cooling') return t('studioPanel.code.previewReady');
    if (saveState === 'saved') return t('studioPanel.code.saveState.saved');
    return t('studioPanel.code.workingCopy.clean');
  })();

  if (loadError) {
    return (
      <div className="code-surface" data-testid="code-surface">
        <header className="code-surface-head">
          <button type="button" className="studio-head-action" onClick={onBack}>
            {'←'} {t('studioPanel.code.back')}
          </button>
          <h2>{t('studioPanel.tabs.code')}</h2>
        </header>
        <p className="code-surface-error">{t('studioPanel.code.loadError')}</p>
      </div>
    );
  }

  if (!sources) {
    return (
      <div className="code-surface" data-testid="code-surface">
        <header className="code-surface-head">
          <button type="button" className="studio-head-action" onClick={onBack}>
            {'←'} {t('studioPanel.code.back')}
          </button>
          <h2>{t('studioPanel.tabs.code')}</h2>
        </header>
        <p className="code-surface-loading">{t('studioPanel.code.loading')}</p>
      </div>
    );
  }

  /** CodeMirror's fallback while its chunk loads, and its permanent stand-in if that
   * chunk fails to load at all (CE-14) — the same plain textarea either way. */
  function plainTextarea(openFile: CodeSurfaceFile) {
    return (
      <textarea
        className="code-surface-editor"
        value={content}
        onChange={(event) => onEdit(event.target.value)}
        onKeyDown={(event) => {
          // Muscle-memory save: without this, Ctrl/Cmd+S in a code editor opens the
          // browser's save-page dialog over the panel.
          if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            void flushPendingSaves();
          }
        }}
        spellCheck={false}
        aria-label={openFile.path}
      />
    );
  }

  return (
    <div className="code-surface" data-testid="code-surface">
      <header className="code-surface-head">
        <button type="button" className="studio-head-action" onClick={onBack}>
          {'←'} {t('studioPanel.code.back')}
        </button>
        <h2>{t('studioPanel.tabs.code')}</h2>
        {sources.readOnly ? (
          <span
            className="code-surface-readonly-banner"
            role="status"
            aria-label={t('studioPanel.code.agentRound')}
            title={t('studioPanel.code.agentRound')}
          >
            <span className="code-surface-readonly-banner-full">{t('studioPanel.code.agentRound')}</span>
            <span className="code-surface-readonly-banner-compact">{t('studioPanel.code.agentRoundCompact')}</span>
          </span>
        ) : null}
      </header>

      <div className="code-surface-file-picker">
        <button
          ref={filePickerTriggerRef}
          type="button"
          className="code-surface-file-trigger"
          disabled={sources.files.length === 0}
          aria-label={t('studioPanel.code.filePicker')}
          aria-haspopup="dialog"
          aria-expanded={filePickerOpen}
          onClick={() => setFilePickerOpen(true)}
        >
          <PixelIcon name="code" size={13} />
          <span className="code-surface-file-trigger-path">{file?.path ?? t('studioPanel.code.noFiles')}</span>
          <PixelIcon name="chevronDown" size={11} />
        </button>
      </div>

      <div className="code-surface-body">
        <nav className="code-surface-rail" aria-label={t('studioPanel.tabs.code')} ref={railRef}>
          {sources.files.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className={`code-surface-rail-item${entry.path === selected ? ' is-active' : ''}${fileDotClass(entry)}`}
              onClick={() => selectFile(entry.path)}
              title={entry.stagedBy ? t('studioPanel.code.stagedBy', { who: entry.stagedBy }) : entry.path}
            >
              <span className="code-surface-rail-path">{entry.path}</span>
              {entry.stagedBy ? <span className="code-surface-rail-dot" aria-hidden="true" /> : null}
            </button>
          ))}
          {LOCKED_DIRS.map((dir) => (
            <div key={dir} className="code-surface-rail-locked" title={t('studioPanel.code.lockedHint')}>
              <PixelIcon name="lock" size={11} />
              <span>{dir}</span>
            </div>
          ))}
        </nav>

        <div className="code-surface-viewer">
          {!file ? (
            <p className="code-surface-empty">{t('studioPanel.code.noFiles')}</p>
          ) : editable ? (
            <CodeMirrorBoundary fallback={plainTextarea(file)}>
              <Suspense fallback={plainTextarea(file)}>
                <LazyCodeMirrorEditor
                  key={selected}
                  value={content}
                  language={languageFor(file.path)}
                  onChange={onEdit}
                  onSave={() => void flushPendingSaves()}
                  diagnostics={cmDiagnostics}
                  languageService={languageServiceForEditor}
                  onGotoDefinition={handleGotoDefinition}
                  initialSelection={initialSelectionForEditor}
                  fetchGhostText={fetchGhostText}
                />
              </Suspense>
            </CodeMirrorBoundary>
          ) : (
            <pre className="code-surface-readonly-view" aria-label={file.path}>
              {content.split('\n').map((line, index) => (
                <div key={index} className="code-surface-line">
                  <span className="code-surface-line-number">{index + 1}</span>
                  <span className="code-surface-line-text">
                    {tokenizeLine(line, languageFor(file.path)).map((token, tokenIndex) => (
                      <span key={tokenIndex} className={`code-tok code-tok-${token.kind}`}>
                        {token.text}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>

      {liveBudget ? (
        <div className={`code-surface-budget${liveBudget.oversize ? ' is-oversize' : ''}`}>
          {t('studioPanel.code.budget', { lines: liveBudget.lines, maxLines: liveBudget.maxLines })}
        </div>
      ) : null}

      {diagnostics && diagnostics.length > 0 ? (
        <ul className="code-surface-diagnostics" role="alert">
          {diagnostics.map((diagnostic, index) => (
            <li key={index}>{diagnostic}</li>
          ))}
        </ul>
      ) : null}

      {editable ? (
        <footer className="code-surface-foot">
          <div className="code-surface-working-copy">
            <span
              className={`code-surface-save-state is-${saveState}${hasWorkingCopy ? ' has-changes' : ''}`}
              aria-live="polite"
              data-testid="code-working-copy-status"
            >
              {workingCopyLabel}
            </span>
            {livePush ? (
              <span className="code-surface-live-push" aria-live="polite">
                {t('studioPanel.code.livePush')}
              </span>
            ) : null}
            {rebuildError ? (
              <span className="code-surface-rebuild-error">{t('studioPanel.code.rebuildError')}</span>
            ) : null}
            {hasWorkingCopy ? (
              <button
                type="button"
                className="code-surface-discard"
                disabled={discardState === 'discarding' || deliverState === 'delivering'}
                onClick={() => void discardWorkingCopy()}
              >
                {discardState === 'discarding' ? t('studioPanel.code.discarding') : t('studioPanel.code.discard')}
              </button>
            ) : null}
          </div>

          <div className="code-surface-deliver">
            <span
              className="code-surface-publish-hint"
              aria-label={t('studioPanel.code.publishHintTitle')}
              tabIndex={0}
              title={t('studioPanel.code.publishHintTitle')}
            >
              {t('studioPanel.code.publishHint')}
            </span>
            <button
              type="button"
              className="code-surface-deliver-btn studio-head-action is-primary"
              disabled={!hasWorkingCopy || deliverState === 'delivering' || discardState === 'discarding'}
              onClick={() => void deliver()}
            >
              {deliverState === 'delivering' ? t('studioPanel.code.delivering') : t('studioPanel.code.deliver')}
            </button>
          </div>

          {deliverMessage ? (
            // Anything short of a delivered outcome is a problem report — muted grey
            // for those buried the one line telling the creator why nothing shipped.
            <span
              className={`code-surface-deliver-message${deliverState === 'delivered' ? '' : ' is-error'}`}
              role="status"
            >
              {deliverMessage}
            </span>
          ) : null}
        </footer>
      ) : null}

      {filePickerOpen ? (
        <div
          className="code-surface-file-backdrop"
          role="presentation"
          onClick={() => {
            setFilePickerOpen(false);
            filePickerTriggerRef.current?.focus();
          }}
        >
          <section
            className="code-surface-file-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="code-surface-file-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="code-surface-file-sheet-head">
              <h3 id="code-surface-file-picker-title">{t('studioPanel.code.filePicker')}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setFilePickerOpen(false);
                  filePickerTriggerRef.current?.focus();
                }}
                aria-label={t('studioPanel.code.filePickerClose')}
              >
                <PixelIcon name="close" size={13} />
              </button>
            </header>
            <div className="code-surface-file-options" role="listbox" aria-label={t('studioPanel.code.filePicker')}>
              {sources.files.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className={`code-surface-file-option${entry.path === selected ? ' is-active' : ''}`}
                  role="option"
                  aria-selected={entry.path === selected}
                  onClick={() => {
                    selectFile(entry.path);
                    setFilePickerOpen(false);
                    filePickerTriggerRef.current?.focus();
                  }}
                >
                  <span className="code-surface-file-option-path">{entry.path}</span>
                  {entry.stagedBy ? (
                    <span className="code-surface-file-option-status">
                      {t('studioPanel.code.stagedBy', { who: entry.stagedBy })}
                    </span>
                  ) : null}
                  {entry.path === selected ? <PixelIcon name="check" size={13} /> : null}
                </button>
              ))}
              {LOCKED_DIRS.map((dir) => (
                <div
                  key={dir}
                  className="code-surface-file-option is-locked"
                  role="option"
                  aria-selected="false"
                  aria-disabled="true"
                >
                  <PixelIcon name="lock" size={11} />
                  <span className="code-surface-file-option-path">{dir}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {kitViewerLine !== null && kitDeclarationRef.current ? (
        <div className="code-surface-kit-backdrop" role="presentation" onClick={() => setKitViewerLine(null)}>
          <section
            className="code-surface-kit-viewer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="code-surface-kit-viewer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="code-surface-kit-viewer-head">
              <h3 id="code-surface-kit-viewer-title">{t('studioPanel.code.kitViewerTitle')}</h3>
              <button
                type="button"
                className="code-surface-kit-close"
                onClick={() => setKitViewerLine(null)}
                aria-label={t('studioPanel.code.kitViewerClose')}
              >
                <PixelIcon name="close" size={13} />
              </button>
            </header>
            <pre className="code-surface-readonly-view code-surface-kit-viewer-body" ref={kitViewerBodyRef}>
              {kitDeclarationRef.current.split('\n').map((line, index) => (
                <div key={index} className={`code-surface-line${index + 1 === kitViewerLine ? ' is-jump-target' : ''}`}>
                  <span className="code-surface-line-number">{index + 1}</span>
                  <span className="code-surface-line-text">
                    {tokenizeLine(line, 'typescript').map((token, tokenIndex) => (
                      <span key={tokenIndex} className={`code-tok code-tok-${token.kind}`}>
                        {token.text}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          </section>
        </div>
      ) : null}
    </div>
  );
}
