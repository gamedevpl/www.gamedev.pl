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
import {
  CodeActionsMenu,
  type CodeActionsCommand,
  type CodeActionsMode,
  type CodeActionsSearchMatch,
} from './CodeActionsMenu.js';
import { formatShortcut } from './codeActionsMatch.js';
import type { CodeMirrorDiagnostic } from './CodeMirrorEditor.js';
import {
  CodeSurfaceApiError,
  deliverCodeSurface,
  fetchCodeSurfaceCompletion,
  fetchCodeSurfaceKitDeclaration,
  discardCodeSurfaceEdits,
  fetchCodeSurfaceSources,
  rebuildCodeSurfaceStage,
  requestCodeSurfacePreview,
  restoreCodeSurfaceFile,
  stageCodeSurfaceFile,
  typecheckCodeSurface,
  type CodeSurfaceFile,
  type CodeSurfaceSources,
} from './codeSurfaceApi.js';
import { CodeSurfaceExplorerTree, CodeSurfaceTreeInputs } from './CodeSurfaceExplorerTree.js';
import { CodeSurfaceTreeDialogs } from './CodeSurfaceTreeDialogs.js';
import { useCodeSurfaceTree } from './useCodeSurfaceTree.js';
import {
  getCodeSurfaceSessionState,
  setCodeSurfaceEditorState,
  setCodeSurfaceSessionState,
} from './codeSurfaceSessionState.js';
import {
  AGENT_GUIDE,
  codeSurfaceToolNames,
  isAgentModeEnabled,
  registerCodeSurfaceWebMcpTools,
  runAgentConsoleCommand,
  setAgentModeEnabled,
  subscribeAgentActivity,
} from './webmcp.js';
import { StudioCreatorAgentKeyPanel } from './StudioCreatorAgentKeyPanel.js';
import { flushLanguageFileUpdates, queueLanguageFileUpdate } from './codeSurfaceLanguageBind.js';
import {
  createCodeSurfaceLanguageService,
  fromVfsPath,
  KIT_DECLARATION_PATH,
  toVfsPath,
  type CodeSurfaceLanguageService,
} from './codeSurfaceLanguageService.js';
import { type CodeLanguage, tokenizeLine } from './codeTokens.js';
import { diffLines } from './diffLines.js';
import { declaredParamDefaultChanges, type DeclaredParamChange } from './editorJsonLiveDiff.js';
import { clampParamValue, parseEditorParams, scrubStep, withParamDefault } from './editorParamsScrub.js';
import { NumberScrubber } from './NumberScrubber.js';
import { PixelIcon } from '../../PixelIcon.js';
import { fetchGameEditor, type EditorContentDoc, type EditorParamValue } from '../../studioApi.js';
import type { EditorContentPush } from '../../editorBridge.js';
import { recordCodeStep } from '../../visitTelemetry.js';
import './code-surface.css';
import './code-surface-agent.css';
import './code-surface-explorer.css';
import './code-surface-editor.css';
import './code-surface-statusbar.css';
import './code-actions-menu.css';

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
// "Agent is editing" banner duration after the last WebMCP tool call.
const AGENT_ACTIVITY_BANNER_MS = 4_000;
const TYPECHECK_DEBOUNCE_MS = 400;
// Wait after the last stage write before arming a preview rebuild.
const PREVIEW_DEBOUNCE_MS = 2_500;

// Mirrors staged-preview.ts's STAGED_PREVIEW_MIN_GAP_MS: floor between rebuilds.
const STAGE_REBUILD_COOLDOWN_MS = 25_000;

// Agent console: how many past command/result pairs stay visible on the page.
const AGENT_CONSOLE_HISTORY_LIMIT = 20;
type AgentConsoleHistoryEntry = { n: number; command: string; output: string; ok: boolean };

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';
type RebuildState = 'idle' | 'pending' | 'cooling';
type DiscardState = 'idle' | 'discarding';
// Track 2's near-instant preview, distinct from the debounced `rebuildState`.
type SyncPreviewState = 'idle' | 'pending' | 'ready';

export type CodeSurfaceProps = {
  slug: string;
  onBack: () => void;
  /** Filled in by `StudioStage`; lets a live param edit reach the running game. */
  editorPushRef?: MutableRefObject<EditorContentPush | null>;
  // Set by CreatorStudioView's own shortcut, fired before this surface existed.
  pendingActionsMode?: { mode: CodeActionsMode; nonce: number } | null;
  onPendingActionsModeConsumed?: () => void;
  // Track 2: shows a synchronous rebuild the instant it's ready.
  onPreviewReady?: (html: string) => void;
  // Fires when the menu closes with nothing picked.
  onActionsMenuCancelled?: () => void;
};

function languageFor(path: string): CodeLanguage {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.md')) return 'markdown';
  return 'text';
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

export function CodeSurface({
  slug,
  onBack,
  editorPushRef,
  pendingActionsMode,
  onPendingActionsModeConsumed,
  onPreviewReady,
  onActionsMenuCancelled,
}: CodeSurfaceProps) {
  const { t, i18n } = useTranslation();
  const [sources, setSources] = useState<CodeSurfaceSources | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => getCodeSurfaceSessionState(slug)?.selected ?? null);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => getCodeSurfaceSessionState(slug)?.drafts ?? {});
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [diagnostics, setDiagnostics] = useState<string[] | null>(null);
  const [rebuildState, setRebuildState] = useState<RebuildState>('idle');
  const [rebuildError, setRebuildError] = useState(false);
  const [syncPreviewState, setSyncPreviewState] = useState<SyncPreviewState>('idle');
  const [discardState, setDiscardState] = useState<DiscardState>('idle');
  const [deliverState, setDeliverState] = useState<'idle' | 'delivering' | 'delivered'>('idle');
  const [deliverMessage, setDeliverMessage] = useState<string | null>(null);
  // A required file the last delivery was refused for.
  const [missingRequiredPath, setMissingRequiredPath] = useState<string | null>(null);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  // Nonce remounts an open palette so a repeat shortcut re-targets it.
  const [actionsMenu, setActionsMenu] = useState<{ mode: CodeActionsMode; nonce: number } | null>(null);
  /** Briefly true after a live param push (§E tier 1) — separate from `saveState`. */
  const [livePush, setLivePush] = useState(false);
  // True while the current file shows its diff, not the editor.
  const [showDiff, setShowDiff] = useState(false);
  // CE-17: briefly true right after staging opened a fresh round.
  const [roundOpenedNotice, setRoundOpenedNotice] = useState(false);
  const roundOpenedNoticeTimerRef = useRef<number | null>(null);
  // True while a WebMCP tool call landed recently.
  const [agentActive, setAgentActive] = useState(false);
  const agentActiveTimerRef = useRef<number | null>(null);
  // Creator opt-in for WebMCP; modal also offers a real-MCP path.
  const [agentModeOpen, setAgentModeOpen] = useState(false);
  const [agentModeEnabled, setAgentModeEnabledState] = useState(() => isAgentModeEnabled(slug));
  // DOM console for browser agents that can type but not call tools.
  const [agentConsoleInput, setAgentConsoleInput] = useState('{"tool":"get_sources","input":{}}');
  const [agentConsoleHistory, setAgentConsoleHistory] = useState<AgentConsoleHistoryEntry[]>([]);
  const [agentConsoleBusy, setAgentConsoleBusy] = useState(false);

  const openedRecordedRef = useRef(false);
  // Focus holder before the actions menu opened; restored on close.
  const actionsReturnFocusRef = useRef<HTMLElement | null>(null);
  const fileOpenedRecordedRef = useRef(new Set<string>());
  const filePickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const kitViewerBodyRef = useRef<HTMLPreElement | null>(null);
  /** One autosave timer per dirty path, not one shared timer — editing a second file
   * inside the debounce window must not cancel the first file's pending save. */
  const saveTimersRef = useRef<Map<string, number>>(new Map());
  // In-flight autosave PUTs by path, awaited before delete.
  const savingPromisesRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const typecheckTimerRef = useRef<number | null>(null);
  const livePushTimerRef = useRef<number | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const lastRebuildAtRef = useRef(0);
  // Bumped by every edit, to detect a superseded sync preview.
  const syncPreviewGenerationRef = useRef(0);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  /** The content doc believed live in the game now — lazy-fetched, kept current by pushes. */
  const liveContentRef = useRef<EditorContentDoc | null>(null);
  const liveContentPromiseRef = useRef<Promise<EditorContentDoc | null> | null>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const onPreviewReadyRef = useRef(onPreviewReady);
  onPreviewReadyRef.current = onPreviewReady;

  // GA-04: a ref, not state — languageServiceReady below signals it exists.
  const languageServiceRef = useRef<CodeSurfaceLanguageService | null>(null);
  const pendingTsUpdatesRef = useRef<Array<{ path: string; content: string | null }>>([]);
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

  // Poll while an agent could be staging. Was gated on readOnly, which needs
  // a dispatch a self-build round never has — so it never armed there.
  const watching = Boolean(sources?.readOnly || sources?.agentRound);
  useEffect(() => {
    if (!watching) return undefined;
    const id = window.setInterval(() => load(false), 4_000);
    return () => window.clearInterval(id);
  }, [watching, load]);

  useEffect(() => {
    setCodeSurfaceSessionState(slug, {
      selected,
      drafts,
      editorStates: getCodeSurfaceSessionState(slug)?.editorStates,
    });
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

  const openedViaPendingRef = useRef(false);

  const openActionsMenu = useCallback((mode: CodeActionsMode, viaPending = false) => {
    openedViaPendingRef.current = viaPending;
    setActionsMenu((current) => {
      if (!current) {
        const focused = document.activeElement;
        actionsReturnFocusRef.current = focused instanceof HTMLElement ? focused : null;
      }
      return { mode, nonce: (current?.nonce ?? 0) + 1 };
    });
  }, []);

  const closeActionsMenu = useCallback((acted = false) => {
    setActionsMenu(null);
    const previous = actionsReturnFocusRef.current;
    actionsReturnFocusRef.current = null;
    if (previous?.isConnected) previous.focus();
    if (!acted && openedViaPendingRef.current) onActionsMenuCancelledRef.current?.();
    openedViaPendingRef.current = false;
  }, []);

  const onPendingActionsModeConsumedRef = useRef(onPendingActionsModeConsumed);
  onPendingActionsModeConsumedRef.current = onPendingActionsModeConsumed;
  const onActionsMenuCancelledRef = useRef(onActionsMenuCancelled);
  onActionsMenuCancelledRef.current = onActionsMenuCancelled;
  const pendingActionsModeRef = useRef(pendingActionsMode);
  pendingActionsModeRef.current = pendingActionsMode;
  const pendingActionsConsumedRef = useRef(false);

  useEffect(() => {
    if (!pendingActionsMode || !sources || pendingActionsConsumedRef.current) return;
    pendingActionsConsumedRef.current = true;
    openActionsMenu(pendingActionsMode.mode, true);
    onPendingActionsModeConsumedRef.current?.();
  }, [pendingActionsMode, sources, openActionsMenu]);

  // Drops an unconsumed request on unmount so it can't replay later.
  useEffect(() => {
    return () => {
      if (pendingActionsModeRef.current && !pendingActionsConsumedRef.current) {
        onPendingActionsModeConsumedRef.current?.();
      }
    };
  }, []);

  // VS Code keys; capture phase beats browser print/search and CodeMirror.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'p') {
        event.preventDefault();
        openActionsMenu(event.shiftKey ? 'commands' : 'files');
      } else if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        openActionsMenu('search');
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [openActionsMenu]);

  // GA-09: Escape closes the kit viewer, like the file picker.
  useEffect(() => {
    if (kitViewerLine === null) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setKitViewerLine(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [kitViewerLine]);

  useEffect(() => {
    if (!agentModeOpen) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setAgentModeOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [agentModeOpen]);

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
      if (roundOpenedNoticeTimerRef.current !== null) window.clearTimeout(roundOpenedNoticeTimerRef.current);
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

  // Re-reads the creator's stored opt-in whenever the round changes.
  useEffect(() => {
    setAgentModeEnabledState(isAgentModeEnabled(slug));
  }, [slug]);

  // No-op without modelContext; locked or opted-out rounds get none.
  useEffect(() => {
    if (!editable || !agentModeEnabled) return undefined;
    return registerCodeSurfaceWebMcpTools(slug);
  }, [editable, agentModeEnabled, slug]);

  function toggleAgentMode(next: boolean) {
    setAgentModeEnabledState(next);
    setAgentModeEnabled(slug, next);
    recordCodeStep(next ? 'agent_mode_enabled' : 'agent_mode_disabled');
  }

  async function runAgentConsole() {
    if (agentConsoleBusy) return;
    setAgentConsoleBusy(true);
    recordCodeStep('agent_console_run');
    const command = agentConsoleInput;
    try {
      const result = await runAgentConsoleCommand(slug, command);
      setAgentConsoleHistory((prev) => {
        const n = (prev[0]?.n ?? 0) + 1;
        const entry: AgentConsoleHistoryEntry = { n, command, output: result.output, ok: result.ok };
        return [entry, ...prev].slice(0, AGENT_CONSOLE_HISTORY_LIMIT);
      });
    } finally {
      setAgentConsoleBusy(false);
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeAgentActivity((event) => {
      setAgentActive(true);
      if (agentActiveTimerRef.current !== null) window.clearTimeout(agentActiveTimerRef.current);
      agentActiveTimerRef.current = window.setTimeout(() => setAgentActive(false), AGENT_ACTIVITY_BANNER_MS);
      if (event.phase !== 'done' || !event.mutates) return;
      // An agent rewrote the working copy — reload before the next autosave.
      load(false);
      const { affectedPaths } = event;
      if (!affectedPaths) return;
      // Drop the stale draft and pending save for what the agent wrote.
      const isAffected = (path: string) => affectedPaths === 'all' || affectedPaths.includes(path);
      for (const [path, timer] of saveTimersRef.current) {
        if (!isAffected(path)) continue;
        window.clearTimeout(timer);
        saveTimersRef.current.delete(path);
      }
      setDrafts((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const path of Object.keys(next)) {
          if (!isAffected(path)) continue;
          delete next[path];
          changed = true;
        }
        return changed ? next : prev;
      });
      if (selected !== null && isAffected(selected)) setSaveState('clean');
    });
    return () => {
      unsubscribe();
      if (agentActiveTimerRef.current !== null) window.clearTimeout(agentActiveTimerRef.current);
    };
  }, [load, selected]);

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
      if (service) flushLanguageFileUpdates(pendingTsUpdatesRef.current, service);
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
      pendingTsUpdatesRef.current = [];
      languageServiceInitRef.current = false;
      setLanguageServiceReady(false);
    };
  }, [slug]);

  const file = useMemo(() => sources?.files.find((entry) => entry.path === selected) ?? null, [sources, selected]);
  const content = selected !== null ? (drafts[selected] ?? file?.content ?? '') : '';
  const diff = useMemo(() => {
    if (file?.base === undefined) return null;
    return diffLines(file.base, content);
  }, [file, content]);
  // Track 3: EDITOR.json's declared params, shown above the raw text.
  const editorParams = useMemo(() => {
    if (file?.path !== 'EDITOR.json') return null;
    const parsed = parseEditorParams(content);
    return parsed && Object.keys(parsed.params).length > 0 ? parsed.params : null;
  }, [file, content]);

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

  /** Owner-staged paths, staged deletions, and local drafts that still differ. */
  const changedPaths = useMemo(() => {
    if (!sources) return [] as string[];
    const paths = new Set<string>();
    for (const entry of sources.files) {
      if (entry.stagedBy === 'owner') paths.add(entry.path);
    }
    for (const path of sources.deleted) paths.add(path);
    for (const [path, draft] of Object.entries(drafts)) {
      const base = sources.files.find((entry) => entry.path === path);
      if (base && draft !== base.content) paths.add(path);
      else if (!base) paths.add(path);
    }
    return [...paths];
  }, [sources, drafts]);

  const hasWorkingCopy = changedPaths.length > 0 || saveState === 'dirty' || saveState === 'saving';

  // Search corpus: drafts overlay, matching what the editor shows.
  const actionsContents = useMemo(() => {
    if (!sources) return {};
    return Object.fromEntries(sources.files.map((entry) => [entry.path, drafts[entry.path] ?? entry.content]));
  }, [sources, drafts]);

  const actionsFiles = useMemo(() => {
    if (!sources) return [];
    return sources.files.map((entry) => ({ path: entry.path, changed: changedPaths.includes(entry.path) }));
  }, [sources, changedPaths]);

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

  function closeFilePicker() {
    setFilePickerOpen(false);
    filePickerTriggerRef.current?.focus();
  }

  function selectFile(path: string) {
    setSelected(path);
    setDiagnostics(null);
    setShowDiff(false);
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

  function handleOpenFileFromActions(path: string) {
    // Rides the pendingJump path search matches use — the new editor claims focus.
    if (path !== selected) setPendingJump({ path, from: 0, to: 0 });
    selectFile(path);
    closeActionsMenu(true);
  }

  // A search hit rides GA-09's jump and lands as a selection.
  function handleOpenSearchMatch(match: CodeActionsSearchMatch) {
    setPendingJump({ path: match.path, from: match.from, to: match.to });
    selectFile(match.path);
    closeActionsMenu(true);
  }

  const schedulePreviewRebuild = useCallback(() => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    // A new edit invalidates any earlier in-flight or ready preview.
    syncPreviewGenerationRef.current += 1;
    setSyncPreviewState('idle');
    const arm = () => {
      previewTimerRef.current = null;
      const since = Date.now() - lastRebuildAtRef.current;
      if (since < STAGE_REBUILD_COOLDOWN_MS && lastRebuildAtRef.current > 0) {
        previewTimerRef.current = window.setTimeout(arm, STAGE_REBUILD_COOLDOWN_MS - since);
        return;
      }
      setRebuildError(false);
      setRebuildState('pending');
      // Track 2: shows the synchronous rebuild the instant it lands.
      const generation = syncPreviewGenerationRef.current;
      setSyncPreviewState('pending');
      void requestCodeSurfacePreview(slug)
        .then((result) => {
          onPreviewReadyRef.current?.(result.html);
          if (syncPreviewGenerationRef.current === generation) setSyncPreviewState('ready');
        })
        .catch(() => {
          if (syncPreviewGenerationRef.current === generation) setSyncPreviewState('idle');
        });
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
        if (result.roundOpened !== undefined) {
          recordCodeStep('round_reopened');
          setRoundOpenedNotice(true);
          if (roundOpenedNoticeTimerRef.current !== null) window.clearTimeout(roundOpenedNoticeTimerRef.current);
          roundOpenedNoticeTimerRef.current = window.setTimeout(() => setRoundOpenedNotice(false), 6_000);
        }
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

  // Fires and tracks an autosave so a delete can await it.
  function runAutosave(path: string, value: string) {
    const promise = saveNow(path, value);
    savingPromisesRef.current.set(path, promise);
    void promise.finally(() => {
      if (savingPromisesRef.current.get(path) === promise) savingPromisesRef.current.delete(path);
    });
  }

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
      const params: Record<string, EditorParamValue> =
        prevParams && !Array.isArray(prevParams) ? { ...(prevParams as Record<string, EditorParamValue>) } : {};
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
        runAutosave(path, value);
      }, AUTOSAVE_MS),
    );
    if (typecheckTimerRef.current !== null) window.clearTimeout(typecheckTimerRef.current);
    typecheckTimerRef.current = window.setTimeout(() => {
      void runTypecheck();
    }, TYPECHECK_DEBOUNCE_MS);
  }

  // A scrub drives the same path a typed edit would.
  function scrubParamDefault(key: string, value: EditorParamValue) {
    if (selected !== 'EDITOR.json') return;
    const next = withParamDefault(content, key, value);
    if (next !== null) onEdit(next);
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

  const prepareMutation = useCallback(async (paths: string[]) => {
    for (const path of paths) {
      const timer = saveTimersRef.current.get(path);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        saveTimersRef.current.delete(path);
      }
      await savingPromisesRef.current.get(path);
    }
  }, []);

  const tree = useCodeSurfaceTree({
    slug,
    files: sources?.files ?? [],
    drafts,
    selected,
    editable,
    prepareMutation,
    onSources: setSources,
    onDrafts: setDrafts,
    onSelect: (path) => (path ? selectFile(path) : setSelected(null)),
    onError: (message) => setDeliverMessage(message),
    onRebuild: schedulePreviewRebuild,
    onDiscard: discardWorkingCopy,
    onTsUpdate: (path, content) =>
      queueLanguageFileUpdate(pendingTsUpdatesRef.current, languageServiceRef.current, path, content),
  });

  // The fixit under a refused delivery: stage the file, open it.
  async function restoreMissingFile(path: string) {
    setRestoringPath(path);
    try {
      const result = await restoreCodeSurfaceFile(slug, path);
      recordCodeStep('restored_missing');
      setMissingRequiredPath(null);
      setSources(await fetchCodeSurfaceSources(slug));
      selectFile(path);
      setDeliverMessage(
        result.from === 'stub'
          ? t('studioPanel.code.restoredStub', { path })
          : t('studioPanel.code.restoredDelivery', { path }),
      );
      schedulePreviewRebuild();
    } catch (error) {
      // Quote the server's reason, including "nothing to restore it from".
      setMissingRequiredPath(null);
      setDeliverMessage(error instanceof CodeSurfaceApiError ? error.message : t('studioPanel.code.restoreError'));
    } finally {
      setRestoringPath(null);
    }
  }

  async function deliver() {
    setDeliverState('delivering');
    setDeliverMessage(null);
    setMissingRequiredPath(null);
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
      if (error instanceof CodeSurfaceApiError && error.code === 'no_active_round') {
        setDeliverMessage(t('studioPanel.code.deliverNoActiveRound'));
      } else {
        setDeliverMessage(error instanceof CodeSurfaceApiError ? error.message : t('studioPanel.code.deliverError'));
        // The one delivery failure the creator can fix from here.
        if (error instanceof CodeSurfaceApiError && error.code === 'invalid_upload') {
          setMissingRequiredPath(error.missing?.[0] ?? null);
        }
      }
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

  // Only currently-possible actions listed; silent no-op commands read broken.
  const actionsCommands: CodeActionsCommand[] = [];
  if (editable) {
    actionsCommands.push({
      id: 'save',
      label: t('studioPanel.code.actions.commandSave'),
      hint: formatShortcut('S'),
      run: () => void flushPendingSaves(),
    });
    if (hasWorkingCopy && deliverState !== 'delivering' && discardState === 'idle') {
      actionsCommands.push({ id: 'publish', label: t('studioPanel.code.deliver'), run: () => void deliver() });
      actionsCommands.push({
        id: 'discard',
        label: t('studioPanel.code.discard'),
        run: () => tree.requestDiscard(),
      });
    }
    actionsCommands.push({
      id: 'preview',
      label: t('studioPanel.code.actions.commandPreview'),
      run: () => schedulePreviewRebuild(),
    });
    actionsCommands.push({
      id: 'typecheck',
      label: t('studioPanel.code.actions.commandTypecheck'),
      run: () => void runTypecheck(),
    });
  }
  if (kitDeclarationRef.current) {
    actionsCommands.push({
      id: 'kit',
      label: t('studioPanel.code.actions.commandKit'),
      run: () => setKitViewerLine(1),
    });
  }
  actionsCommands.push({ id: 'back', label: t('studioPanel.code.actions.commandBack'), run: onBack });

  return (
    <div className="code-surface" data-testid="code-surface">
      <header className="code-surface-head">
        <button type="button" className="studio-head-action" onClick={onBack}>
          {'←'} {t('studioPanel.code.back')}
        </button>
        <h2>{t('studioPanel.tabs.code')}</h2>
        {file?.base !== undefined ? (
          <button
            type="button"
            className={`code-surface-diff-toggle${showDiff ? ' is-active' : ''}`}
            onClick={() => setShowDiff((current) => !current)}
            aria-pressed={showDiff}
          >
            <PixelIcon name="eye" size={12} />
            {showDiff ? t('studioPanel.code.showCode') : t('studioPanel.code.showDiff')}
          </button>
        ) : null}
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
        {agentActive ? (
          <span className="code-surface-agent-active-banner" role="status" aria-live="polite">
            {t('studioPanel.code.agentActive')}
          </span>
        ) : null}
        {editable ? (
          <button
            type="button"
            className={`code-surface-agent-mode-trigger${agentModeEnabled ? ' is-active' : ''}`}
            onClick={() => setAgentModeOpen(true)}
            aria-haspopup="dialog"
            aria-pressed={agentModeEnabled}
          >
            <PixelIcon name="sparkle" size={12} />
            {t('studioPanel.code.agentMode.trigger')}
          </button>
        ) : null}
        <button
          type="button"
          className="code-surface-actions-trigger"
          onClick={() => openActionsMenu('files')}
          aria-haspopup="dialog"
          aria-expanded={actionsMenu !== null}
          title={t('studioPanel.code.actions.triggerTitle', {
            quickOpen: formatShortcut('P'),
            commands: formatShortcut('P', { shift: true }),
            search: formatShortcut('F', { shift: true }),
          })}
        >
          <PixelIcon name="search" size={12} />
          <span className="code-surface-actions-trigger-label">{t('studioPanel.code.actions.trigger')}</span>
          <kbd className="code-surface-palette-kbd">{formatShortcut('P')}</kbd>
        </button>
      </header>

      <div className="code-surface-file-picker">
        <button
          ref={filePickerTriggerRef}
          type="button"
          className="code-surface-file-trigger"
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
          <CodeSurfaceExplorerTree variant="rail" {...tree.treeProps} />
        </nav>

        <div className="code-surface-viewer">
          {editorParams && !showDiff ? (
            <div className="code-surface-params" role="group" aria-label={t('studioPanel.code.paramsPanel')}>
              {Object.entries(editorParams).map(([key, spec]) => {
                const label = i18n.language?.startsWith('pl') ? spec.label.pl : spec.label.en;
                return (
                  <div key={key} className="code-surface-param-row">
                    <span className="code-surface-param-label">{label}</span>
                    {spec.type === 'int' || spec.type === 'number' ? (
                      <NumberScrubber
                        value={spec.default as number}
                        min={spec.min}
                        max={spec.max}
                        step={scrubStep(spec)}
                        ariaLabel={label}
                        disabled={!editable}
                        onChange={(next) => scrubParamDefault(key, clampParamValue(spec, next))}
                      />
                    ) : spec.type === 'enum' ? (
                      <select
                        className="code-surface-param-select"
                        value={spec.default as string}
                        disabled={!editable}
                        aria-label={label}
                        onChange={(event) => scrubParamDefault(key, event.target.value)}
                      >
                        {spec.values.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : spec.type === 'bool' ? (
                      <input
                        type="checkbox"
                        checked={spec.default as boolean}
                        disabled={!editable}
                        aria-label={label}
                        onChange={(event) => scrubParamDefault(key, event.target.checked)}
                      />
                    ) : (
                      <input
                        type="text"
                        className="code-surface-param-text"
                        value={spec.default as string}
                        disabled={!editable}
                        maxLength={spec.max}
                        aria-label={label}
                        onChange={(event) => scrubParamDefault(key, event.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
          {!file ? (
            <p className="code-surface-empty">{t('studioPanel.code.noFiles')}</p>
          ) : showDiff ? (
            diff ? (
              <pre className="code-surface-diff-view" aria-label={`${file.path} — ${t('studioPanel.code.showDiff')}`}>
                {diff.map((line, index) => (
                  <div key={index} className={`code-surface-diff-line code-surface-diff-line-${line.kind}`}>
                    <span className="code-surface-diff-marker" aria-hidden="true">
                      {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}
                    </span>
                    <span className="code-surface-line-text">
                      {tokenizeLine(line.text, languageFor(file.path)).map((token, tokenIndex) => (
                        <span key={tokenIndex} className={`code-tok code-tok-${token.kind}`}>
                          {token.text}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </pre>
            ) : (
              <p className="code-surface-empty">{t('studioPanel.code.diffNoBase')}</p>
            )
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
                  colorPickerLabel={t('studioPanel.code.colorPicker')}
                  initialEditorState={selected ? getCodeSurfaceSessionState(slug)?.editorStates?.[selected] : undefined}
                  onEditorStateChange={(state) => {
                    if (selected) setCodeSurfaceEditorState(slug, selected, state);
                  }}
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

      {diagnostics && diagnostics.length > 0 ? (
        <ul className="code-surface-diagnostics" role="alert">
          {diagnostics.map((diagnostic, index) => (
            <li key={index}>{diagnostic}</li>
          ))}
        </ul>
      ) : null}

      {editable ? (
        // A thin VS Code-style status bar, not a padded footer.
        <footer className="code-surface-statusbar">
          <div className="code-surface-statusbar-row">
            <div className="code-surface-statusbar-left">
              {liveBudget ? (
                <span
                  className={`code-surface-statusbar-item code-surface-budget${liveBudget.oversize ? ' is-oversize' : ''}`}
                >
                  {t('studioPanel.code.budget', { lines: liveBudget.lines, maxLines: liveBudget.maxLines })}
                </span>
              ) : null}
              <span
                className={`code-surface-statusbar-item code-surface-save-state is-${saveState}${hasWorkingCopy ? ' has-changes' : ''}`}
                aria-live="polite"
                data-testid="code-working-copy-status"
              >
                {workingCopyLabel}
              </span>
              {syncPreviewState === 'pending' ? (
                <span className="code-surface-statusbar-item code-surface-preview-status is-pending" aria-live="polite">
                  <span className="status-preview-spinner" aria-hidden="true" /> {t('studioPanel.code.previewSyncing')}
                </span>
              ) : null}
              {syncPreviewState === 'ready' ? (
                <button
                  type="button"
                  className="code-surface-statusbar-item code-surface-preview-status is-ready"
                  onClick={onBack}
                >
                  {t('studioPanel.code.previewSyncReady')}
                </button>
              ) : null}
              {livePush ? (
                <span className="code-surface-statusbar-item code-surface-live-push" aria-live="polite">
                  {t('studioPanel.code.livePush')}
                </span>
              ) : null}
              {roundOpenedNotice ? (
                <span className="code-surface-statusbar-item code-surface-round-opened" aria-live="polite">
                  {t('studioPanel.code.roundOpened')}
                </span>
              ) : null}
              {rebuildError ? (
                <span className="code-surface-statusbar-item code-surface-rebuild-error">
                  {t('studioPanel.code.rebuildError')}
                </span>
              ) : null}
            </div>

            <div className="code-surface-deliver">
              {hasWorkingCopy ? (
                <button
                  type="button"
                  className="code-surface-statusbar-item code-surface-discard"
                  disabled={discardState === 'discarding' || deliverState === 'delivering'}
                  onClick={() => tree.requestDiscard()}
                >
                  {discardState === 'discarding' ? t('studioPanel.code.discarding') : t('studioPanel.code.discard')}
                </button>
              ) : null}
              <span
                className="code-surface-statusbar-item code-surface-publish-hint"
                aria-label={t('studioPanel.code.publishHintTitle')}
                tabIndex={0}
                title={t('studioPanel.code.publishHintTitle')}
              >
                {t('studioPanel.code.publishHint')}
              </span>
              <button
                type="button"
                className="code-surface-statusbar-item code-surface-deliver-btn"
                disabled={!hasWorkingCopy || deliverState === 'delivering' || discardState === 'discarding'}
                onClick={() => void deliver()}
              >
                {deliverState === 'delivering' ? t('studioPanel.code.delivering') : t('studioPanel.code.deliver')}
              </button>
            </div>
          </div>

          {deliverMessage ? (
            // Outside the scroller — a failure must stay visible, not hide.
            <span
              className={`code-surface-deliver-message${deliverState === 'delivered' ? '' : ' is-error'}`}
              role="status"
            >
              {deliverMessage}
              {missingRequiredPath ? (
                <button
                  type="button"
                  className="code-surface-deliver-fix"
                  disabled={restoringPath !== null}
                  onClick={() => void restoreMissingFile(missingRequiredPath)}
                >
                  {restoringPath === missingRequiredPath
                    ? t('studioPanel.code.restoring')
                    : t('studioPanel.code.restoreFile', { path: missingRequiredPath })}
                </button>
              ) : null}
            </span>
          ) : null}
        </footer>
      ) : null}

      {filePickerOpen ? (
        <div
          className="code-surface-file-backdrop"
          role="presentation"
          onClick={() => {
            closeFilePicker();
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
                onClick={() => closeFilePicker()}
                aria-label={t('studioPanel.code.filePickerClose')}
              >
                <PixelIcon name="close" size={13} />
              </button>
            </header>
            <div className="code-surface-file-options">
              <CodeSurfaceExplorerTree
                variant="sheet"
                {...tree.treeProps}
                onSelectFile={(path) => {
                  tree.treeProps.onSelectFile(path);
                  closeFilePicker();
                }}
              />
            </div>
          </section>
        </div>
      ) : null}

      {actionsMenu ? (
        <CodeActionsMenu
          key={actionsMenu.nonce}
          initialMode={actionsMenu.mode}
          files={actionsFiles}
          contents={actionsContents}
          commands={actionsCommands}
          selectedPath={selected}
          onOpenFile={handleOpenFileFromActions}
          onOpenMatch={handleOpenSearchMatch}
          onClose={closeActionsMenu}
        />
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

      {agentModeOpen ? (
        <div className="code-surface-agent-mode-backdrop" role="presentation" onClick={() => setAgentModeOpen(false)}>
          <section
            className="code-surface-agent-mode-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="code-surface-agent-mode-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="code-surface-agent-mode-head">
              <h3 id="code-surface-agent-mode-title">{t('studioPanel.code.agentMode.title')}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setAgentModeOpen(false)}
                aria-label={t('studioPanel.code.agentMode.close')}
              >
                <PixelIcon name="close" size={13} />
              </button>
            </header>

            <div className="code-surface-agent-mode-section">
              <label className="code-surface-agent-mode-toggle">
                <input
                  type="checkbox"
                  checked={agentModeEnabled}
                  onChange={(event) => toggleAgentMode(event.target.checked)}
                />
                {t('studioPanel.code.agentMode.webmcpToggle')}
              </label>
              <p className="code-surface-agent-mode-hint">{t('studioPanel.code.agentMode.webmcpHint')}</p>
            </div>

            <div className="code-surface-agent-mode-section">
              <h4>{t('studioPanel.code.agentMode.bridgeTitle')}</h4>
              <p className="code-surface-agent-mode-hint">{t('studioPanel.code.agentMode.bridgeHint', { slug })}</p>
              <StudioCreatorAgentKeyPanel />
            </div>

            <div className="code-surface-agent-mode-section">
              <h4>{t('studioPanel.code.agentMode.consoleTitle')}</h4>
              <p className="code-surface-agent-mode-hint">{t('studioPanel.code.agentMode.consoleHint')}</p>
              <p className="code-surface-agent-console-tools">{codeSurfaceToolNames().join(' · ')}</p>
              <textarea
                className="code-surface-agent-console-input"
                value={agentConsoleInput}
                onChange={(event) => setAgentConsoleInput(event.target.value)}
                spellCheck={false}
                rows={4}
                aria-label={t('studioPanel.code.agentMode.consoleInputLabel')}
              />
              <button
                type="button"
                className="code-surface-agent-console-run"
                onClick={() => void runAgentConsole()}
                disabled={agentConsoleBusy}
              >
                {agentConsoleBusy
                  ? t('studioPanel.code.agentMode.consoleRunning')
                  : t('studioPanel.code.agentMode.consoleRun')}
              </button>
              {agentConsoleHistory.length > 0 ? (
                <ol className="code-surface-agent-console-history" aria-live="polite">
                  {agentConsoleHistory.map((entry) => (
                    <li key={entry.n} className={`code-surface-agent-console-entry${entry.ok ? '' : ' is-error'}`}>
                      <div className="code-surface-agent-console-entry-command">
                        #{entry.n} {entry.command}
                      </div>
                      <pre className="code-surface-agent-console-output" tabIndex={0}>
                        {entry.output}
                      </pre>
                    </li>
                  ))}
                </ol>
              ) : null}
              <details className="code-surface-agent-console-guide">
                <summary>{t('studioPanel.code.agentMode.consoleGuide')}</summary>
                <pre>{AGENT_GUIDE}</pre>
              </details>
            </div>
          </section>
        </div>
      ) : null}

      <CodeSurfaceTreeInputs {...tree.inputProps} />
      <CodeSurfaceTreeDialogs {...tree.dialogProps} />
    </div>
  );
}
