import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { type CodeLanguage, tokenizeLine } from './codeTokens.js';
import { PixelIcon } from './PixelIcon.js';
import { recordCodeStep } from './visitTelemetry.js';

/**
 * The Code surface (creator-code-editing-execution-plan.md CE-06/07/08/09/13/15):
 * docked over the stage the way `EditorPanel` docks for Edit, mirroring its autosave
 * pattern (CE-13's own instruction: "the pattern is already there; copy it rather than
 * invent a second one").
 *
 * Ships with a plain, always-available text surface — CodeMirror (CE-14) is a planned
 * lazy-loaded enhancement over this same autosave/typecheck/stage-it plumbing, not a
 * prerequisite for it; the surface must not be blank while a chunk loads or fails to.
 *
 * No preview column: the full-bleed game behind this panel *is* the preview (§7 of the
 * plan). "Stage it" is the one thing that changes what it shows — see the rebuild route.
 */

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
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [diagnostics, setDiagnostics] = useState<string[] | null>(null);
  const [rebuildState, setRebuildState] = useState<'idle' | 'pending' | 'cooling'>('idle');
  const [rebuildError, setRebuildError] = useState(false);
  const [attested, setAttested] = useState(false);
  const [deliverState, setDeliverState] = useState<'idle' | 'delivering' | 'delivered'>('idle');
  const [deliverMessage, setDeliverMessage] = useState<string | null>(null);

  const openedRecordedRef = useRef(false);
  const fileOpenedRecordedRef = useRef(new Set<string>());
  const saveTimerRef = useRef<number | null>(null);
  const typecheckTimerRef = useRef<number | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    if (openedRecordedRef.current) return;
    openedRecordedRef.current = true;
    recordCodeStep('offered');
    recordCodeStep('opened');
  }, []);

  const load = useCallback(() => {
    fetchCodeSurfaceSources(slug)
      .then((result) => {
        setSources(result);
        setLoadError(null);
        setSelected((current) => current ?? result.files[0]?.path ?? null);
        if (result.readOnly) recordCodeStep('read_only_agent');
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof CodeSurfaceApiError ? error.message : 'could not load sources');
      });
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // Watching an agent's files land live, while the buffer is locked (CE-08) — the same
  // polling cadence the read-only banner needs to stay current without a page reload.
  useEffect(() => {
    if (!sources?.readOnly) return undefined;
    const id = window.setInterval(load, 4_000);
    return () => window.clearInterval(id);
  }, [sources?.readOnly, load]);

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      if (typecheckTimerRef.current !== null) window.clearTimeout(typecheckTimerRef.current);
    },
    [],
  );

  const file = useMemo(() => sources?.files.find((entry) => entry.path === selected) ?? null, [sources, selected]);
  const content = selected !== null ? (drafts[selected] ?? file?.content ?? '') : '';

  function selectFile(path: string) {
    setSelected(path);
    setDiagnostics(null);
    if (!fileOpenedRecordedRef.current.has(path)) {
      fileOpenedRecordedRef.current.add(path);
      recordCodeStep('file_opened');
    }
  }

  const saveNow = useCallback(
    async (path: string, value: string) => {
      setSaveState('saving');
      try {
        // Autosave never drives the rebuild — see CE-13: the visible stage must not
        // change out from under a creator who is still typing.
        await stageCodeSurfaceFile(slug, path, value, { rebuild: false });
        setSaveState('saved');
        recordCodeStep('edited');
      } catch (error) {
        setSaveState('error');
        if (error instanceof CodeSurfaceApiError && error.code === 'agent_round') {
          // The buffer was live-locked out from under an in-progress edit — a real
          // conflict, not a transient network error, and CE-13's "never silent" rule
          // applies to it as much as to a stale-base overwrite.
          recordCodeStep('conflict_seen');
          setSources((current) => (current ? { ...current, readOnly: true, reason: 'agent_round' } : current));
        }
      }
    },
    [slug],
  );

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
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveNow(path, value);
    }, AUTOSAVE_MS);
    if (typecheckTimerRef.current !== null) window.clearTimeout(typecheckTimerRef.current);
    typecheckTimerRef.current = window.setTimeout(() => {
      void runTypecheck();
    }, TYPECHECK_DEBOUNCE_MS);
  }

  async function stageIt() {
    setRebuildError(false);
    setRebuildState('pending');
    try {
      const path = selectedRef.current;
      if (saveTimerRef.current !== null && path) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        await saveNow(path, draftsRef.current[path] ?? '');
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
      const path = selectedRef.current;
      if (saveTimerRef.current !== null && path) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        await saveNow(path, draftsRef.current[path] ?? '');
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
          <button type="button" className="modal-close-btn" onClick={onBack} aria-label={t('studioPanel.code.back')}>
            <PixelIcon name="close" size={14} />
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
          <button type="button" className="modal-close-btn" onClick={onBack} aria-label={t('studioPanel.code.back')}>
            <PixelIcon name="close" size={14} />
          </button>
          <h2>{t('studioPanel.tabs.code')}</h2>
        </header>
        <p className="code-surface-loading">{t('studioPanel.code.loading')}</p>
      </div>
    );
  }

  const editable = !sources.readOnly;

  return (
    <div className="code-surface" data-testid="code-surface">
      <header className="code-surface-head">
        <button type="button" className="modal-close-btn" onClick={onBack} aria-label={t('studioPanel.code.back')}>
          <PixelIcon name="close" size={14} />
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
            <textarea
              className="code-surface-editor"
              value={content}
              onChange={(event) => onEdit(event.target.value)}
              spellCheck={false}
              aria-label={file.path}
            />
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

      {file?.budget ? (
        <div className={`code-surface-budget${file.budget.oversize ? ' is-oversize' : ''}`}>
          {t('studioPanel.code.budget', { lines: file.budget.lines, maxLines: file.budget.maxLines })}
        </div>
      ) : null}

      {diagnostics && diagnostics.length > 0 ? (
        <ul className="code-surface-diagnostics" role="alert">
          {diagnostics.map((diagnostic) => (
            <li key={diagnostic}>{diagnostic}</li>
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
            className="code-surface-stage-it is-primary"
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
            className="code-surface-deliver-btn is-primary"
            disabled={!attested || deliverState === 'delivering'}
            onClick={() => void deliver()}
          >
            {deliverState === 'delivering' ? t('studioPanel.code.delivering') : t('studioPanel.code.deliver')}
          </button>
          {deliverMessage ? (
            <span className="code-surface-deliver-message" role="status">
              {deliverMessage}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
