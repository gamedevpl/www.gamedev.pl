import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CodeMirrorDiagnostic } from './CodeMirrorEditor.js';
import {
  CodeSurfaceApiError,
  deliverCodeSurface,
  fetchCodeSurfaceSources,
  rebuildCodeSurfaceStage,
  stageCodeSurfaceFile,
  typecheckCodeSurface,
  type CodeSurfaceFile,
  type CodeSurfaceSources,
} from './codeSurfaceApi.js';
import { getCodeSurfaceSessionState, setCodeSurfaceSessionState } from './codeSurfaceSessionState.js';
import { type CodeLanguage, tokenizeLine } from './codeTokens.js';
import { PixelIcon } from './PixelIcon.js';
import { recordCodeStep } from './visitTelemetry.js';

/**
 * The Code surface (creator-code-editing-execution-plan.md CE-06/07/08/09/13/15):
 * docked over the stage the way `EditorPanel` docks for Edit, mirroring its autosave
 * pattern (CE-13's own instruction: "the pattern is already there; copy it rather than
 * invent a second one").
 *
 * CodeMirror 6 (CE-14) is a lazy-loaded route-level chunk — `LazyCodeMirrorEditor`
 * below is a dynamic `import()`, so catalog/player/thread visitors pay zero bytes for
 * it. The read path (CE-07) never imports it at all: a non-owner or a locked agent
 * round gets the plain `codeTokens.ts` viewer, zero new dependencies. When the chunk
 * fails to load — a flaky connection, a CDN hiccup — `CodeMirrorBoundary` below
 * catches it and falls back to a plain `<textarea>`, never a blank panel.
 *
 * No preview column: the full-bleed game behind this panel *is* the preview (§7 of the
 * plan). "Stage it" is the one thing that changes what it shows — see the rebuild route.
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
/** Mirrors staged-preview.ts's STAGED_PREVIEW_MIN_GAP_MS: the floor between rebuilds. */
const STAGE_REBUILD_COOLDOWN_MS = 25_000;

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export type CodeSurfaceProps = {
  slug: string;
  onBack: () => void;
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

export function CodeSurface({ slug, onBack }: CodeSurfaceProps) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<CodeSurfaceSources | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => getCodeSurfaceSessionState(slug)?.selected ?? null);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => getCodeSurfaceSessionState(slug)?.drafts ?? {});
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [diagnostics, setDiagnostics] = useState<string[] | null>(null);
  const [rebuildState, setRebuildState] = useState<'idle' | 'pending' | 'cooling'>('idle');
  const [rebuildError, setRebuildError] = useState(false);
  const [attested, setAttested] = useState(false);
  const [deliverState, setDeliverState] = useState<'idle' | 'delivering' | 'delivered'>('idle');
  const [deliverMessage, setDeliverMessage] = useState<string | null>(null);

  const openedRecordedRef = useRef(false);
  const fileOpenedRecordedRef = useRef(new Set<string>());
  /** One autosave timer per dirty path, not one shared timer — editing a second file
   * inside the debounce window must not cancel the first file's pending save. */
  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const typecheckTimerRef = useRef<number | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  useEffect(() => {
    if (openedRecordedRef.current) return;
    openedRecordedRef.current = true;
    recordCodeStep('opened');
  }, []);

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
    },
    [slug],
  );

  const file = useMemo(() => sources?.files.find((entry) => entry.path === selected) ?? null, [sources, selected]);
  const content = selected !== null ? (drafts[selected] ?? file?.content ?? '') : '';

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

  /** Returns whether the save actually landed — `stageIt`/`deliver` must not proceed
   * over a flush that failed, or they ship a build missing the creator's last edit. */
  const saveNow = useCallback(
    async (path: string, value: string): Promise<boolean> => {
      setSaveState('saving');
      try {
        // Autosave never drives the rebuild — see CE-13: the visible stage must not
        // change out from under a creator who is still typing.
        await stageCodeSurfaceFile(slug, path, value, { rebuild: false });
        setSaveState('saved');
        recordCodeStep('edited');
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
    [slug],
  );

  /** Flushes every path with a pending autosave — not just the one currently open —
   * before a "Stage it" or deliver acts on the buffer. Returns false if any of them
   * failed to save, so the caller can refuse to proceed over an incomplete flush. */
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

  function onEdit(value: string) {
    const path = selected;
    if (!path) return;
    setDrafts((prev) => ({ ...prev, [path]: value }));
    setSaveState('dirty');
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

  async function stageIt() {
    setRebuildError(false);
    setRebuildState('pending');
    try {
      const flushed = await flushPendingSaves();
      if (!flushed) {
        setRebuildError(true);
        setRebuildState('idle');
        return;
      }
      await rebuildCodeSurfaceStage(slug);
      recordCodeStep('previewed');
      // The debounce/gap floor in staged-preview.ts means the rebuild is not
      // instant — say so on the button rather than looking broken for up to ~25s
      // (CE-13's explicit "the one thing not allowed is a click that appears to do
      // nothing").
      setRebuildState('cooling');
      window.setTimeout(() => setRebuildState('idle'), STAGE_REBUILD_COOLDOWN_MS);
    } catch {
      setRebuildError(true);
      setRebuildState('idle');
    }
  }

  async function deliver() {
    if (!attested) return;
    setDeliverState('delivering');
    setDeliverMessage(null);
    try {
      const flushed = await flushPendingSaves();
      if (!flushed) {
        setDeliverState('idle');
        setDeliverMessage(t('studioPanel.code.deliverError'));
        return;
      }
      const outcome = await deliverCodeSurface(slug, 'publish');
      if (outcome.accepted) {
        recordCodeStep('delivered');
        setDeliverState('delivered');
        setDeliverMessage(t('studioPanel.code.deliverSuccess'));
      } else {
        setDeliverState('idle');
        setDeliverMessage(t('studioPanel.code.deliverRefused'));
      }
    } catch (error) {
      setDeliverState('idle');
      setDeliverMessage(error instanceof CodeSurfaceApiError ? error.message : t('studioPanel.code.deliverError'));
    }
  }

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

  const editable = !sources.readOnly;

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
          <span className="code-surface-readonly-banner" role="status">
            {t('studioPanel.code.agentRound')}
          </span>
        ) : null}
      </header>

      <div className="code-surface-body">
        <nav className="code-surface-rail" aria-label={t('studioPanel.tabs.code')}>
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
          <span className={`code-surface-save-state is-${saveState}`} aria-live="polite">
            {t(`studioPanel.code.saveState.${saveState}`)}
          </span>
          {rebuildError ? (
            <span className="code-surface-rebuild-error">{t('studioPanel.code.rebuildError')}</span>
          ) : null}
          <button
            type="button"
            className="code-surface-stage-it studio-head-action is-primary"
            onClick={() => void stageIt()}
            disabled={rebuildState !== 'idle'}
          >
            {rebuildState === 'pending'
              ? t('studioPanel.code.staging')
              : rebuildState === 'cooling'
                ? t('studioPanel.code.staged')
                : t('studioPanel.code.stageIt')}
          </button>
        </footer>
      ) : null}

      {editable ? (
        <div className="code-surface-deliver">
          <label className="code-surface-attestation">
            <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
            {t('studioPanel.code.attestation')}
          </label>
          <button
            type="button"
            className="code-surface-deliver-btn studio-head-action is-primary"
            disabled={!attested || deliverState === 'delivering'}
            onClick={() => void deliver()}
          >
            {deliverState === 'delivering' ? t('studioPanel.code.delivering') : t('studioPanel.code.deliver')}
          </button>
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
        </div>
      ) : null}
    </div>
  );
}
