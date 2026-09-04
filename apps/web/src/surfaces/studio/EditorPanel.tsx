import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { PathPainter } from '../../PathPainter.js';
import {
  blankItem,
  applyEditorPatch,
  collectionProblems,
  defaultCollectionKey,
  defaultLayerKey,
  defaultLayerTileKey,
  isPathItem,
  isTilemapItem,
  itemProblems,
  layerProblems,
  layeredProblems,
  setCell,
} from '../../editorContentTools.js';
import { LayeredBoard, LayeredSidebar } from '../../LayeredEditorSurface.js';
import { EditorSurface } from './EditorSurface.js';
import { editorSurfaceModeForDefinition } from './editorSurfaceMode.js';
import { useEditorDocument } from './useEditorDocument.js';
import { recordAssistStep, recordEditorStep } from '../../visitTelemetry.js';
import type { EditorContentPush, EditorControllerState, EditorSelection } from '../../editorBridge.js';
import {
  deleteEditorDraft,
  fetchGameEditor,
  publishEditorContent,
  requestEditorAssist,
  type EditorContentDoc,
  type EditorLayersDoc,
  type EditorItemContent,
  type EditorParamValue,
  type EditorLayerSpec,
  type GameEditorState,
  type StudioApiError,
  type StudioGame,
} from '../../studioApi.js';
import { getSubmissionStatus, listMySubmissions } from '../../submissionApi.js';
import { pollDelayMs } from './studioStatusPoll.js';
import { isRoundSealed } from './roundSealed.js';
import '../../editor-kit.css';
import '../../editor-kit-side.css';
import {
  firstTileKey,
  itemsOf,
  mergeDraft,
  pathCollection,
  tilemapCollection,
  useLabel,
} from './editorPanelHelpers.js';

/**
 * The studio's Edit surface (EditorKit L3): renders a game's own editor
 * definition with the fixed widget vocabulary — collection list, tilemap
 * painter, property sheet, live constraint checks — and keeps the creator's
 * draft saved platform-side as they work, and pushes each change live (§E
 * tier 1).
 *
 * The panel renders only what the definition declares. It never invents
 * structure: an unknown widget cannot reach here (the gate refuses the
 * definition), and every rule shown (grid bounds, ranges, constraints) is the
 * same rule the server enforces on the draft write and the gate enforces on
 * publish. Edits are free and instant; "Publish" is the one deliberate,
 * rate-limited step, and even that only produces a gated candidate an operator
 * still promotes.
 */

/**
 * What the composer is doing, and what it last said.
 *
 * `undo` holds the document from *before* the patch — the panel's whole undo
 * story, per the plan's "apply immediately, one tap back" rule. It is one step
 * and in memory only: the draft tier is a single mutable document, so promising
 * more than one step back would be a lie.
 */
type AssistState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'applied'; message: string; undo: EditorContentDoc }
  | { kind: 'note'; message: string }
  | { kind: 'error'; message: string };
type PublishState =
  | { kind: 'idle' }
  | { kind: 'publishing' }
  | { kind: 'published'; version: string }
  | { kind: 'cooldown'; retryAfterMs?: number }
  /** 409 not_sealed: polling the round's status, will retry publish once it seals. */
  | { kind: 'waiting' }
  | { kind: 'error'; message: string };

export function EditorPanel(props: {
  game: StudioGame;
  /** The stage's live-push channel (§E tier 1). */
  editorPushRef?: MutableRefObject<EditorContentPush | null>;
  controller?: EditorControllerState | null;
  onSurfaceModeChange?: (mode: 'docked' | 'full') => void;
  onOpenPlaytest: () => void;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const name = useLabel();
  const onSurfaceModeChange = props.onSurfaceModeChange;
  const pathMessages = {
    pointCount: (count: number, min: number, max: number) =>
      t('studioPanel.editor.pathPointCount', { count, min, max }),
    outOfBounds: (index: number) => t('studioPanel.editor.pathOutOfBounds', { index }),
    distinct: () => t('studioPanel.editor.pathDistinct'),
    repeatedEnd: () => t('studioPanel.editor.pathRepeatedEnd'),
  };
  const slug = props.game.slug as string;
  const pushLive = useCallback(
    (next: EditorContentDoc, selection?: EditorSelection | null) => {
      const push = props.editorPushRef?.current;
      if (!push) return;
      if (selection) push(next, selection);
      else push(next);
    },
    [props.editorPushRef],
  );

  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [editor, setEditor] = useState<GameEditorState | null>(null);
  const [publish, setPublish] = useState<PublishState>({ kind: 'idle' });
  const [selectedCollectionKey, setSelectedCollectionKey] = useState<string | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [tileKey, setTileKey] = useState<string | null>(null);
  const [selectedLayerKey, setSelectedLayerKey] = useState<string | null>(null);
  const [layerEntityIndex, setLayerEntityIndex] = useState(0);
  const [layerTileKey, setLayerTileKey] = useState<string | null>(null);
  const [utterance, setUtterance] = useState('');
  const [assist, setAssist] = useState<AssistState>({ kind: 'idle' });
  const [controllerDisabled, setControllerDisabled] = useState(false);
  const controllerActive = Boolean(
    props.controller?.status === 'ready' && !controllerDisabled && props.controller.view,
  );
  const lastControllerChangeRef = useRef<string | null>(null);
  const document = useEditorDocument({ slug, onPush: (next) => pushLive(next) });
  const {
    content,
    setContent,
    contentRef,
    saveState,
    saveProblems,
    saveNow,
    scheduleSave: scheduleDocumentSave,
    reset: resetDocument,
    undo,
    redo,
    canUndo,
    canRedo,
    markError,
  } = document;

  const collectionKeys = editor ? Object.keys(editor.definition.content) : [];
  const collectionKey =
    editor && selectedCollectionKey && editor.definition.content[selectedCollectionKey] ? selectedCollectionKey : null;
  const spec = collectionKey ? editor!.definition.content[collectionKey] : null;
  const items = collectionKey ? ((content[collectionKey] ?? []) as EditorItemContent[]) : [];
  const item = items[itemIndex] ?? null;
  const layerKeys = editor ? Object.keys(editor.definition.layers ?? {}) : [];
  const layerKey =
    editor && selectedLayerKey && editor.definition.layers?.[selectedLayerKey]
      ? selectedLayerKey
      : defaultLayerKey(editor?.definition.layers ?? {});
  const layerSpec: EditorLayerSpec | null =
    layerKey && editor?.definition.layers ? editor.definition.layers[layerKey] : null;
  const layersContent = (content.layers ?? {}) as EditorLayersDoc;
  const paramSpecs = editor?.definition.params ?? null;
  const paramValues = (content.params ?? {}) as Record<string, EditorParamValue>;

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchGameEditor(slug)
      .then((loaded) => {
        if (cancelled) return;
        // The revision funnel's first rung: this creator can edit and did open it.
        recordEditorStep('opened');
        setEditor(loaded);
        const merged = mergeDraft(loaded);
        resetDocument(merged, loaded.draft?.revision ?? 0);
        const defaultKey = defaultCollectionKey(loaded.definition.content);
        const defaultLayer = defaultLayerKey(loaded.definition.layers ?? {});
        pushLive(
          merged,
          defaultKey
            ? { collection: defaultKey, index: 0 }
            : defaultLayer
              ? { collection: defaultLayer, index: 0 }
              : undefined,
        );
        setSelectedCollectionKey(defaultKey);
        setItemIndex(0);
        setTileKey(defaultKey ? firstTileKey(loaded.definition.content[defaultKey]) : null);
        setSelectedLayerKey(defaultLayer);
        setLayerEntityIndex(0);
        setLayerTileKey(defaultLayer ? defaultLayerTileKey(loaded.definition.layers ?? {}, defaultLayer) : null);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [onSurfaceModeChange, pushLive, resetDocument, slug]);

  useEffect(() => {
    if (!editor) return;
    onSurfaceModeChange?.(editorSurfaceModeForDefinition(editor.definition, controllerActive));
  }, [controllerActive, editor, onSurfaceModeChange]);

  // Guards a stale async reply from pushing into a game switched to since (editorPushRef
  // is shared, parent-owned).
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const scheduleSaveWithPublishReset = useCallback(() => {
    setPublish((current) => (current.kind === 'published' ? { kind: 'idle' } : current));
    scheduleDocumentSave();
  }, [scheduleDocumentSave]);
  const scheduleSave = scheduleSaveWithPublishReset;

  useEffect(() => {
    if (props.controller?.status === 'failed') setControllerDisabled(true);
    else if (props.controller?.status === 'ready') setControllerDisabled(false);
  }, [props.controller?.status]);

  useEffect(() => {
    const selected = props.controller?.selected;
    if (!selected) return;
    setSelectedLayerKey(selected.layer);
    setLayerEntityIndex(selected.index ?? 0);
    recordEditorStep('selection_from_game');
  }, [props.controller?.selected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  useEffect(() => {
    const change = props.controller?.pendingChange;
    if (!change || lastControllerChangeRef.current === change.id) return;
    lastControllerChangeRef.current = change.id;
    const result = applyEditorPatch(contentRef.current, change.patch);
    if (result.error) {
      props.controller?.acknowledgeChange(change.id, false, result.error);
      props.controller?.useFallback(result.error);
      setControllerDisabled(true);
      return;
    }
    setContent(result.content);
    pushLive(result.content);
    scheduleSave();
    props.controller?.acknowledgeChange(change.id, true);
    recordEditorStep('tool_used');
  }, [contentRef, props.controller, pushLive, scheduleSave, setContent]);

  function updateItem(next: EditorItemContent) {
    if (!collectionKey) return;
    setContent((current) => {
      const list = itemsOf(current, collectionKey).slice();
      list[itemIndex] = next;
      const nextContent = { ...current, [collectionKey]: list };
      pushLive(nextContent, { collection: collectionKey, index: itemIndex });
      return nextContent;
    });
    scheduleSave();
  }

  function updateLayers(nextLayers: EditorLayersDoc) {
    setContent((current) => {
      const nextContent = { ...current, layers: nextLayers };
      pushLive(nextContent, layerKey ? { collection: layerKey, index: 0 } : undefined);
      return nextContent;
    });
    scheduleSave();
  }

  function updateParam(paramName: string, value: EditorParamValue) {
    setContent((current) => {
      const nextContent = {
        ...current,
        params: { ...((current.params ?? {}) as Record<string, EditorParamValue>), [paramName]: value },
      };
      pushLive(nextContent);
      return nextContent;
    });
    scheduleSave();
  }

  /**
   * Send the sentence, apply what comes back, keep one step of undo.
   *
   * The patch is applied exactly the way a slider drag is — into draft state,
   * then through the ordinary autosave — because the server only ever *proposed*
   * a document. There is no confirm step by design: confirming every tweak kills
   * the "say it, see it" feel, and the sliders plus this undo are the safety net.
   */
  async function askAssist() {
    const text = utterance.trim();
    if (text.length < 2 || assist.kind === 'asking') return;
    setAssist({ kind: 'asking' });
    recordAssistStep('asked');
    const before = contentRef.current;
    try {
      const result = await requestEditorAssist(slug, text, before);
      if (!mountedRef.current) return;
      const message = result.summary ? (i18n.language?.startsWith('pl') ? result.summary.pl : result.summary.en) : '';
      if (result.lane === 'params' && result.content && result.patches && result.patches.length > 0) {
        setContent(result.content);
        pushLive(result.content);
        scheduleSave();
        setUtterance('');
        recordAssistStep('applied');
        setAssist({
          kind: 'applied',
          message: message || t('studioPanel.editor.assistApplied', { count: result.patches.length }),
          undo: before,
        });
        return;
      }
      // Every non-acting lane says so out loud. A code-lane request is a real
      // answer — this game cannot express it as a setting — not a failure, and
      // it must never look like the composer silently did nothing.
      recordAssistStep(result.lane === 'reject' ? 'rejected' : 'handoff');
      setAssist({
        kind: 'note',
        message:
          message ||
          (result.lane === 'code'
            ? t('studioPanel.editor.assistNeedsCode')
            : result.lane === 'content'
              ? t('studioPanel.editor.assistNeedsContent')
              : t('studioPanel.editor.assistRejected')),
      });
    } catch (error) {
      if (!mountedRef.current) return;
      const status = (error as StudioApiError).status;
      recordAssistStep('rejected');
      setAssist({
        kind: 'error',
        message:
          status === 429
            ? t('studioPanel.editor.assistQuota')
            : status === 422
              ? t('studioPanel.editor.assistRejected')
              : t('studioPanel.editor.assistUnavailable'),
      });
    }
  }

  function undoAssist() {
    if (assist.kind !== 'applied') return;
    const snapshot = assist.undo;
    setContent(snapshot);
    pushLive(snapshot);
    scheduleDocumentSave();
    setAssist({ kind: 'idle' });
  }

  async function reloadNewest() {
    try {
      const loaded = await fetchGameEditor(slug);
      if (!mountedRef.current) return;
      setEditor(loaded);
      const merged = mergeDraft(loaded);
      resetDocument(merged, loaded.draft?.revision ?? 0);
      const defaultKey = defaultCollectionKey(loaded.definition.content);
      const defaultLayer = defaultLayerKey(loaded.definition.layers ?? {});
      pushLive(
        merged,
        defaultKey
          ? { collection: defaultKey, index: 0 }
          : defaultLayer
            ? { collection: defaultLayer, index: 0 }
            : undefined,
      );
      setSelectedCollectionKey(defaultKey);
      setItemIndex(0);
      setTileKey(defaultKey ? firstTileKey(loaded.definition.content[defaultKey]) : null);
      setSelectedLayerKey(defaultLayer);
      setLayerEntityIndex(0);
      setLayerTileKey(defaultLayer ? defaultLayerTileKey(loaded.definition.layers ?? {}, defaultLayer) : null);
    } catch (error) {
      if (mountedRef.current) markError(error);
    }
  }

  function selectCollection(nextKey: string) {
    const nextSpec = editor?.definition.content[nextKey];
    if (!nextSpec) return;
    setSelectedCollectionKey(nextKey);
    setItemIndex(0);
    setTileKey(firstTileKey(nextSpec));
    pushLive(content, { collection: nextKey, index: 0 });
  }

  function selectLayer(nextKey: string) {
    if (!editor?.definition.layers?.[nextKey]) return;
    setSelectedLayerKey(nextKey);
    setLayerEntityIndex(0);
    setLayerTileKey(defaultLayerTileKey(editor.definition.layers, nextKey));
    pushLive(content, { collection: nextKey, index: 0 });
  }

  async function discardDraft() {
    try {
      await deleteEditorDraft(slug);
      if (!mountedRef.current) return;
      if (editor) {
        resetDocument(editor.content, 0);
        const defaultKey = defaultCollectionKey(editor.definition.content);
        const defaultLayer = defaultLayerKey(editor.definition.layers ?? {});
        pushLive(
          editor.content,
          defaultKey
            ? { collection: defaultKey, index: 0 }
            : defaultLayer
              ? { collection: defaultLayer, index: 0 }
              : undefined,
        );
        setSelectedCollectionKey(defaultKey);
        setItemIndex(0);
        setSelectedLayerKey(defaultLayer);
        setLayerEntityIndex(0);
        setLayerTileKey(defaultLayer ? defaultLayerTileKey(editor.definition.layers ?? {}, defaultLayer) : null);
      }
    } catch (error) {
      if (mountedRef.current) markError(error);
    }
  }

  async function publishNow() {
    // The not_sealed retry calls this directly, bypassing the disabled button.
    if (allProblems.length > 0) {
      setPublish({ kind: 'idle' });
      return;
    }
    // Flush any pending edit first, so what publishes is what the creator sees —
    // and stop if that flush did not land. A rejected save (409 from another tab,
    // 422 from moderation or the schema, or a dropped connection) leaves the
    // server holding an older draft, and publishing it anyway would report
    // success for content the creator is not looking at. The save's own banner
    // already says what went wrong.
    if (saveState === 'dirty') {
      if (!(await saveNow())) return;
    }
    setPublish({ kind: 'publishing' });
    try {
      const result = await publishEditorContent(slug);
      recordEditorStep('published');
      setPublish({ kind: 'published', version: result.version });
    } catch (error) {
      const apiError = error as StudioApiError;
      if (apiError.status === 429) setPublish({ kind: 'cooldown', retryAfterMs: apiError.retryAfterMs });
      else if (apiError.status === 409 && apiError.code === 'not_sealed') setPublish({ kind: 'waiting' });
      else setPublish({ kind: 'error', message: apiError.detail ?? apiError.message });
    }
  }

  // Latest publishNow, so the poll loop below never uses a stale saveState.
  const publishNowRef = useRef(publishNow);
  useEffect(() => {
    publishNowRef.current = publishNow;
  });

  // Poll the round's status, retry publish once sealed (see StudioWelcomeView.isReady).
  useEffect(() => {
    if (publish.kind !== 'waiting') return undefined;
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      try {
        const submissions = await listMySubmissions();
        const mine = submissions.find((submission) => submission.slug === slug);
        if (!mine) {
          // Dropped off the shelf (abandoned/canceled) — stop instead of retrying forever.
          if (!cancelled) setPublish({ kind: 'error', message: t('studioPanel.editor.notSealedUnknown') });
          return;
        }
        const detail = await getSubmissionStatus(mine.token);
        if (cancelled) return;
        const sealed = isRoundSealed(detail);
        if (sealed) {
          void publishNowRef.current();
          return;
        }
        timer = window.setTimeout(() => void tick(), pollDelayMs(detail.status, detail.stall, detail.phase) ?? 10_000);
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void tick(), 10_000);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
    // Only restart on entering/leaving 'waiting' — not every publishNow closure change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish.kind, slug]);

  if (state === 'loading') {
    return <div className="editor-panel editor-panel-note">{t('studioPanel.editor.loading')}</div>;
  }
  // A definition may declare only tunables (no collections) — that renders as a
  // Tuning-only panel, not an error. Nothing at all to edit is the error case.
  if (state === 'error' || !editor || (!spec && !layerSpec && !paramSpecs)) {
    return (
      <div className="editor-panel editor-panel-note">
        {t('studioPanel.editor.loadError')}
        <button type="button" className="studio-head-action" onClick={props.onBack}>
          {t('studioPanel.playtest.backToThread')}
        </button>
      </div>
    );
  }

  const problems = item && spec ? itemProblems(spec.item, item, name, pathMessages) : [];
  const collectionWideProblems = spec ? collectionProblems(spec, items) : [];
  const activeLayerProblems =
    layerSpec && layerKey ? layerProblems(layerSpec, layersContent[layerKey], name, pathMessages) : [];
  const layeredWideProblems = editor?.definition.layers
    ? layeredProblems(editor.definition.layers, editor.definition.constraints, layersContent)
    : [];
  const allProblems = editor
    ? [
        ...collectionKeys.flatMap((key) => {
          const collection = editor.definition.content[key];
          const collectionItems = itemsOf(content, key);
          const perItem = collectionItems.flatMap((entry, index) => {
            const found = itemProblems(collection.item, entry, name, pathMessages);
            return found.length > 0 ? [`${name(collection.itemLabel)} ${index + 1}`] : [];
          });
          const collectionWide = collectionProblems(collection, collectionItems);
          return collectionWide.length > 0 ? [...perItem, name(collection.itemLabel)] : perItem;
        }),
        ...layerKeys.flatMap((key) => {
          const declaredLayer = editor.definition.layers?.[key];
          if (!declaredLayer) return [];
          return layerProblems(declaredLayer, layersContent[key], name, pathMessages).length > 0
            ? [name(declaredLayer.label)]
            : [];
        }),
        ...(layeredWideProblems.length > 0 ? ['Layers'] : []),
        // Guarded: a dead controller's stale checks must not strand Publish.
        ...(controllerActive && props.controller?.checks?.ok === false ? [t('studioPanel.editor.checksFromGame')] : []),
      ]
    : [];
  const tilemapItem = item && isTilemapItem(item) ? item : null;
  const pathItem = item && isPathItem(item) ? item : null;
  const boardSpec = tilemapCollection(spec);
  const pathSpec = pathCollection(spec);
  const width = tilemapItem ? (tilemapItem.rows[0]?.length ?? 0) : 0;
  return (
    <div className="editor-panel">
      <div className="editor-panel-head">
        <button type="button" className="studio-head-action" onClick={props.onBack}>
          ← {t('studioPanel.editor.back')}
        </button>
        <span className="editor-save-state" aria-live="polite">
          {saveState === 'saving' || saveState === 'dirty'
            ? t('studioPanel.editor.saving')
            : saveState === 'saved'
              ? t('studioPanel.editor.saved')
              : saveState === 'error'
                ? t('studioPanel.editor.saveError')
                : ''}
        </span>
        <div className="editor-panel-actions">
          <button type="button" className="studio-head-action" disabled={!canUndo} onClick={() => undo()}>
            ↶
          </button>
          <button type="button" className="studio-head-action" disabled={!canRedo} onClick={() => redo()}>
            ↷
          </button>
          <button
            type="button"
            className="studio-head-action"
            // Flush first: the panel unmounts on navigation and its cleanup cancels
            // the debounce timer, so a click inside that window would have sent the
            // creator to a playtest of the draft *before* their last edit.
            onClick={() => {
              recordEditorStep('previewed');
              if (saveState === 'dirty') {
                void saveNow().then(() => props.onOpenPlaytest());
                return;
              }
              props.onOpenPlaytest();
            }}
          >
            <PixelIcon name="play" size={12} /> {t('studioPanel.editor.tryDraft')}
          </button>
          <button
            type="button"
            className="studio-head-action is-primary"
            disabled={publish.kind === 'publishing' || publish.kind === 'waiting' || allProblems.length > 0}
            onClick={() => void publishNow()}
          >
            {publish.kind === 'publishing' || publish.kind === 'waiting'
              ? t('studioPanel.editor.publishing')
              : t('studioPanel.editor.publish')}
          </button>
        </div>
      </div>

      {saveState === 'conflict' ? (
        <div className="editor-banner" role="alert">
          {t('studioPanel.editor.conflict')}
          <button type="button" onClick={() => void reloadNewest()}>
            {t('studioPanel.editor.conflictReload')}
          </button>
          <button type="button" onClick={() => void saveNow(true)}>
            {t('studioPanel.editor.conflictOverwrite')}
          </button>
        </div>
      ) : null}
      {saveState === 'error' && saveProblems.length > 0 ? (
        <div className="editor-banner" role="alert">
          {saveProblems.slice(0, 3).join(' · ')}
        </div>
      ) : null}
      {publish.kind === 'published' ? (
        <div className="editor-banner is-ok" role="status">
          {t('studioPanel.editor.published')}
        </div>
      ) : null}
      {publish.kind === 'cooldown' ? (
        <div className="editor-banner" role="status">
          {t('studioPanel.editor.cooldown')}
        </div>
      ) : null}
      {publish.kind === 'waiting' ? (
        <div className="editor-banner" role="status">
          {t('studioPanel.editor.notSealed')}
        </div>
      ) : null}
      {publish.kind === 'error' ? (
        <div className="editor-banner" role="alert">
          {publish.message}
        </div>
      ) : null}
      {props.controller?.status === 'failed' || controllerDisabled ? (
        <div className="editor-banner" role="alert">
          {props.controller?.reason ?? t('studioPanel.editor.controllerFallback')}
        </div>
      ) : null}

      <div className="editor-body">
        {controllerActive && props.controller ? (
          <EditorSurface controller={props.controller} />
        ) : layerSpec && layerKey && editor.definition.layers ? (
          <LayeredBoard
            layers={editor.definition.layers}
            content={layersContent}
            activeLayerKey={layerKey}
            name={name}
            tileKey={layerTileKey}
            onTileKeyChange={setLayerTileKey}
            onLayerChange={selectLayer}
            onChange={updateLayers}
          />
        ) : boardSpec || pathSpec ? (
          <div className="editor-board-col">
            {boardSpec && tilemapItem ? (
              <>
                <div
                  className="editor-board"
                  role="grid"
                  aria-label={t('studioPanel.editor.boardAria', { name: name(boardSpec.itemLabel) })}
                  style={{ gridTemplateColumns: `repeat(${width}, var(--editor-cell))` }}
                >
                  {tilemapItem.rows.map((rowChars, row) =>
                    Array.from(rowChars).map((char, col) => {
                      const tile = boardSpec.item.tiles.find((entry) => entry.char === char);
                      return (
                        <button
                          key={`${row}-${col}`}
                          type="button"
                          role="gridcell"
                          // A declared color wins and suppresses the fallback tile
                          // class, so the painter shows the game's own palette; the
                          // class-based look is for definitions that declare none.
                          className={`editor-cell${tile?.color ? '' : ` tile-${tile?.key ?? 'unknown'}`}`}
                          {...(tile?.color ? { style: { background: tile.color } } : {})}
                          aria-label={`${row + 1},${col + 1}: ${tile ? name(tile.label) : char}`}
                          onClick={() => {
                            const selected = boardSpec.item.tiles.find((entry) => entry.key === tileKey);
                            if (selected) updateItem(setCell(tilemapItem, row, col, selected.char));
                          }}
                        />
                      );
                    }),
                  )}
                </div>
                <div className="editor-palette" role="radiogroup" aria-label={t('studioPanel.editor.tiles')}>
                  {boardSpec.item.tiles.map((tile) => (
                    <button
                      key={tile.key}
                      type="button"
                      role="radio"
                      aria-checked={tileKey === tile.key}
                      className={`editor-tile${tileKey === tile.key ? ' is-selected' : ''}`}
                      onClick={() => setTileKey(tile.key)}
                    >
                      <span
                        className={`editor-tile-swatch${tile.color ? '' : ` tile-${tile.key}`}`}
                        {...(tile.color ? { style: { background: tile.color } } : {})}
                        aria-hidden="true"
                      />
                      {name(tile.label)}
                    </button>
                  ))}
                </div>
              </>
            ) : pathSpec && pathItem ? (
              <PathPainter
                key={`${collectionKey}-${itemIndex}`}
                spec={pathSpec.item}
                item={pathItem}
                ariaLabel={t('studioPanel.editor.pathAria', { name: name(pathSpec.itemLabel) })}
                instructions={t('studioPanel.editor.pathHelp')}
                onChange={updateItem}
              />
            ) : (
              <div className="editor-panel-note">{t('studioPanel.editor.empty')}</div>
            )}
          </div>
        ) : null}

        <aside className="editor-side">
          {paramSpecs ? (
            <div className="editor-side-group">
              <h4>{t('studioPanel.editor.tuning')}</h4>
              {/*
               * The composer sits above the sliders on purpose: it is the fast
               * path when the creator knows what they want in words, and the
               * sliders directly beneath are both the fallback when the router
               * misreads and the way to nudge whatever it just set.
               */}
              <form
                className="editor-assist"
                onSubmit={(event) => {
                  event.preventDefault();
                  void askAssist();
                }}
              >
                <input
                  type="text"
                  className="editor-assist-input"
                  maxLength={240}
                  value={utterance}
                  placeholder={t('studioPanel.editor.assistPlaceholder')}
                  aria-label={t('studioPanel.editor.assistLabel')}
                  onChange={(event) => setUtterance(event.target.value)}
                />
                <button
                  type="submit"
                  className="editor-assist-send"
                  disabled={assist.kind === 'asking' || utterance.trim().length < 2}
                >
                  {assist.kind === 'asking' ? t('studioPanel.editor.assistAsking') : t('studioPanel.editor.assistSend')}
                </button>
              </form>
              {assist.kind === 'applied' ? (
                <p className="editor-assist-note is-ok" role="status">
                  {assist.message}{' '}
                  <button type="button" className="editor-assist-undo" onClick={undoAssist}>
                    {t('studioPanel.editor.assistUndo')}
                  </button>
                </p>
              ) : null}
              {assist.kind === 'note' || assist.kind === 'error' ? (
                <p className="editor-assist-note" role="status">
                  {assist.message}
                </p>
              ) : null}
              {Object.entries(paramSpecs).map(([paramName, paramSpec]) => {
                const value = paramValues[paramName] ?? paramSpec.default;
                if (paramSpec.type === 'int' || paramSpec.type === 'number') {
                  const step = paramSpec.type === 'int' ? 1 : (paramSpec.max - paramSpec.min) / 100;
                  const shown = typeof value === 'number' ? value : paramSpec.min;
                  return (
                    <label key={paramName} className="editor-prop editor-tuning-row">
                      <span>
                        {name(paramSpec.label)} <em>{Math.round(shown * 100) / 100}</em>
                      </span>
                      <input
                        type="range"
                        min={paramSpec.min}
                        max={paramSpec.max}
                        step={step}
                        value={shown}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          if (!Number.isFinite(parsed)) return;
                          updateParam(paramName, paramSpec.type === 'int' ? Math.round(parsed) : parsed);
                        }}
                      />
                    </label>
                  );
                }
                if (paramSpec.type === 'enum') {
                  return (
                    <label key={paramName} className="editor-prop">
                      <span>{name(paramSpec.label)}</span>
                      <select
                        value={typeof value === 'string' ? value : paramSpec.values[0]}
                        onChange={(event) => updateParam(paramName, event.target.value)}
                      >
                        {paramSpec.values.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                if (paramSpec.type === 'text') {
                  return (
                    <label key={paramName} className="editor-prop">
                      <span>{name(paramSpec.label)}</span>
                      <input
                        type="text"
                        maxLength={paramSpec.max}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) => updateParam(paramName, event.target.value)}
                      />
                    </label>
                  );
                }
                return (
                  <label key={paramName} className="editor-prop">
                    <span>{name(paramSpec.label)}</span>
                    <input
                      type="checkbox"
                      checked={value === true}
                      onChange={(event) => updateParam(paramName, event.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
          ) : null}

          {layerSpec && editor.definition.layers ? (
            <LayeredSidebar
              layers={editor.definition.layers}
              content={layersContent}
              activeLayerKey={layerKey}
              name={name}
              entityIndex={layerEntityIndex}
              onEntityIndexChange={setLayerEntityIndex}
              onLayerChange={selectLayer}
              onChange={updateLayers}
            />
          ) : null}

          {spec && collectionKey ? (
            <div className="editor-side-group">
              {collectionKeys.length > 1 ? (
                <label className="editor-collection-selector">
                  <span>{t('studioPanel.editor.collection')}</span>
                  <select
                    value={collectionKey}
                    aria-label={t('studioPanel.editor.collection')}
                    onChange={(event) => selectCollection(event.target.value)}
                  >
                    {collectionKeys.map((key) => (
                      <option key={key} value={key}>
                        {name(editor.definition.content[key].label)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <h4>
                {name(spec.label)}{' '}
                <span className="editor-count">
                  {items.length} / {spec.max}
                </span>
              </h4>
              <ul className="editor-item-list">
                {items.map((entry, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      className={index === itemIndex ? 'is-active' : ''}
                      onClick={() => {
                        if (index === itemIndex) return;
                        setItemIndex(index);
                        pushLive(content, { collection: collectionKey, index });
                      }}
                    >
                      {typeof entry.properties.name === 'string' && entry.properties.name
                        ? entry.properties.name
                        : `${name(spec.itemLabel)} ${index + 1}`}
                    </button>
                    {items.length > spec.min ? (
                      <button
                        type="button"
                        className="editor-item-remove"
                        aria-label={t('studioPanel.editor.removeItem')}
                        onClick={() => {
                          const nextIndex = Math.max(
                            0,
                            itemIndex > index ? itemIndex - 1 : Math.min(itemIndex, items.length - 2),
                          );
                          setContent((current) => {
                            const list = itemsOf(current, collectionKey).filter((_, i) => i !== index);
                            const nextContent = { ...current, [collectionKey]: list };
                            pushLive(nextContent, { collection: collectionKey, index: nextIndex });
                            return nextContent;
                          });
                          setItemIndex(nextIndex);
                          scheduleSave();
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {items.length < spec.max ? (
                <button
                  type="button"
                  className="editor-add"
                  onClick={() => {
                    const nextIndex = items.length;
                    setContent((current) => {
                      const nextContent = {
                        ...current,
                        [collectionKey]: [...itemsOf(current, collectionKey), blankItem(spec.item)],
                      };
                      pushLive(nextContent, { collection: collectionKey, index: nextIndex });
                      return nextContent;
                    });
                    setItemIndex(nextIndex);
                    scheduleSave();
                  }}
                >
                  ＋ {t('studioPanel.editor.addItem', { name: name(spec.itemLabel) })}
                </button>
              ) : null}
            </div>
          ) : null}

          {item && spec ? (
            <div className="editor-side-group">
              <h4>{t('studioPanel.editor.properties')}</h4>
              {Object.entries(spec.item.properties).map(([propertyName, propertySpec]) => {
                const value = item.properties[propertyName];
                if (propertySpec.type === 'text') {
                  return (
                    <label key={propertyName} className="editor-prop">
                      <span>{propertyName}</span>
                      <input
                        type="text"
                        maxLength={propertySpec.max}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) =>
                          updateItem({
                            ...item,
                            properties: { ...item.properties, [propertyName]: event.target.value },
                          })
                        }
                      />
                    </label>
                  );
                }
                if (propertySpec.type === 'int' || propertySpec.type === 'number') {
                  return (
                    <label key={propertyName} className="editor-prop">
                      <span>
                        {propertyName}{' '}
                        <em>
                          {propertySpec.min}–{propertySpec.max}
                        </em>
                      </span>
                      <input
                        type="number"
                        min={propertySpec.min}
                        max={propertySpec.max}
                        step={propertySpec.type === 'int' ? 1 : 'any'}
                        value={typeof value === 'number' ? value : propertySpec.min}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          if (!Number.isFinite(parsed)) return;
                          updateItem({ ...item, properties: { ...item.properties, [propertyName]: parsed } });
                        }}
                      />
                    </label>
                  );
                }
                if (propertySpec.type === 'enum') {
                  return (
                    <label key={propertyName} className="editor-prop">
                      <span>{propertyName}</span>
                      <select
                        value={typeof value === 'string' ? value : propertySpec.values[0]}
                        onChange={(event) =>
                          updateItem({
                            ...item,
                            properties: { ...item.properties, [propertyName]: event.target.value },
                          })
                        }
                      >
                        {propertySpec.values.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                return (
                  <label key={propertyName} className="editor-prop">
                    <span>{propertyName}</span>
                    <input
                      type="checkbox"
                      checked={value === true}
                      onChange={(event) =>
                        updateItem({
                          ...item,
                          properties: { ...item.properties, [propertyName]: event.target.checked },
                        })
                      }
                    />
                  </label>
                );
              })}
            </div>
          ) : null}

          <div className="editor-side-group">
            <h4>{t('studioPanel.editor.checks')}</h4>
            {(
              layerSpec
                ? activeLayerProblems.length === 0 && layeredWideProblems.length === 0
                : problems.length === 0 && collectionWideProblems.length === 0
            ) ? (
              <p className="editor-check is-ok">✓ {t('studioPanel.editor.checksOk')}</p>
            ) : (
              (layerSpec
                ? [...activeLayerProblems, ...layeredWideProblems]
                : [...problems, ...collectionWideProblems]
              ).map((problem) => (
                <p key={problem} className="editor-check is-bad">
                  ✕ {problem}
                </p>
              ))
            )}
            {allProblems.length > 0 ? (
              <p className="editor-check is-bad">
                {t('studioPanel.editor.checksElsewhere', { list: allProblems.join(', ') })}
              </p>
            ) : null}
          </div>

          <div className="editor-side-group">
            <button type="button" className="editor-discard" onClick={() => void discardDraft()}>
              {t('studioPanel.editor.discard')}
            </button>
            <p className="editor-footnote">{t('studioPanel.editor.publishHint')}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
