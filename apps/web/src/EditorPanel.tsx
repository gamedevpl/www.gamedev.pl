import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { recordEditorStep } from './visitTelemetry.js';
import {
  deleteEditorDraft,
  fetchGameEditor,
  publishEditorContent,
  putEditorDraft,
  type EditorCollectionSpec,
  type EditorContentDoc,
  type EditorItemContent,
  type EditorLabel,
  type GameEditorState,
  type StudioApiError,
  type StudioGame,
} from './studioApi.js';

/**
 * The studio's Edit surface (EditorKit L3): renders a game's own editor
 * definition with the fixed widget vocabulary — collection list, tilemap
 * painter, property sheet, live constraint checks — and keeps the creator's
 * draft saved platform-side as they work.
 *
 * The panel renders only what the definition declares. It never invents
 * structure: an unknown widget cannot reach here (the gate refuses the
 * definition), and every rule shown (grid bounds, ranges, constraints) is the
 * same rule the server enforces on the draft write and the gate enforces on
 * publish. Edits are free and instant; "Publish" is the one deliberate,
 * rate-limited step, and even that only produces a gated candidate an operator
 * still promotes.
 */

const AUTOSAVE_MS = 1500;

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';
type PublishState =
  | { kind: 'idle' }
  | { kind: 'publishing' }
  | { kind: 'published'; version: string }
  | { kind: 'cooldown'; retryAfterMs?: number }
  | { kind: 'error'; message: string };

function useLabel(): (label: EditorLabel) => string {
  const { i18n } = useTranslation();
  return useCallback((label: EditorLabel) => (i18n.language?.startsWith('pl') ? label.pl : label.en), [i18n.language]);
}

/** Client-side mirror of the constraint arithmetic — hints only; the server re-checks. */
function itemProblems(spec: EditorCollectionSpec['item'], item: EditorItemContent, name: (label: EditorLabel) => string) {
  const counts = new Map<string, number>(spec.tiles.map((tile) => [tile.key, 0]));
  const charToKey = new Map(spec.tiles.map((tile) => [tile.char, tile.key]));
  for (const row of item.rows) {
    for (const char of row) {
      const key = charToKey.get(char);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const tileName = (key: string) => {
    const tile = spec.tiles.find((entry) => entry.key === key);
    return tile ? name(tile.label) : key;
  };
  const problems: string[] = [];
  for (const rule of spec.constraints) {
    if ('equalCounts' in rule) {
      const [a, b] = rule.equalCounts;
      if (counts.get(a) !== counts.get(b)) {
        problems.push(`${tileName(a)} ${counts.get(a) ?? 0} ≠ ${tileName(b)} ${counts.get(b) ?? 0}`);
      }
      continue;
    }
    const count = counts.get(rule.tile) ?? 0;
    if (rule.exactly !== undefined && count !== rule.exactly) {
      problems.push(`${tileName(rule.tile)}: ${count} / ${rule.exactly}`);
    }
    if (rule.min !== undefined && count < rule.min) {
      problems.push(`${tileName(rule.tile)}: ${count} < ${rule.min}`);
    }
    if (rule.max !== undefined && count > rule.max) {
      problems.push(`${tileName(rule.tile)}: ${count} > ${rule.max}`);
    }
  }
  return problems;
}

function setCell(item: EditorItemContent, row: number, col: number, char: string): EditorItemContent {
  const rows = item.rows.slice();
  rows[row] = rows[row].slice(0, col) + char + rows[row].slice(col + 1);
  return { ...item, rows };
}

function blankItem(spec: EditorCollectionSpec['item']): EditorItemContent {
  // A fresh item starts as the smallest legal grid, all first-tile — the
  // creator paints from there; constraints show what is still missing.
  const fill = spec.tiles[0]?.char ?? '.';
  const properties: Record<string, unknown> = {};
  for (const [name, propertySpec] of Object.entries(spec.properties)) {
    if (propertySpec.type === 'text') properties[name] = '';
    else if (propertySpec.type === 'int' || propertySpec.type === 'number') properties[name] = propertySpec.min;
    else if (propertySpec.type === 'enum') properties[name] = propertySpec.values[0];
    else properties[name] = false;
  }
  return { properties, rows: Array.from({ length: spec.grid.minRows }, () => fill.repeat(spec.grid.minCols)) };
}

export function EditorPanel(props: { game: StudioGame; onOpenPlaytest: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const name = useLabel();
  const slug = props.game.slug as string;

  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [editor, setEditor] = useState<GameEditorState | null>(null);
  const [content, setContent] = useState<EditorContentDoc>({});
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [saveProblems, setSaveProblems] = useState<string[]>([]);
  const [publish, setPublish] = useState<PublishState>({ kind: 'idle' });
  const [itemIndex, setItemIndex] = useState(0);
  const [tileKey, setTileKey] = useState<string | null>(null);

  // One collection is the pilot vocabulary's reality; the first is the surface.
  const collectionKey = editor ? Object.keys(editor.definition.content)[0] : null;
  const spec = collectionKey ? editor!.definition.content[collectionKey] : null;
  const items = collectionKey ? (content[collectionKey] ?? []) : [];
  const item = items[itemIndex] ?? null;

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchGameEditor(slug)
      .then((loaded) => {
        if (cancelled) return;
        // The revision funnel's first rung: this creator can edit and did open it.
        recordEditorStep('opened');
        setEditor(loaded);
        setContent(loaded.draft?.content ?? loaded.content);
        setRevision(loaded.draft?.revision ?? 0);
        setSaveState('clean');
        const firstCollection = Object.keys(loaded.definition.content)[0];
        setTileKey(loaded.definition.content[firstCollection]?.item.tiles[0]?.key ?? null);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Autosave: debounce the whole snapshot. The draft is always a whole document,
  // so a lost timer costs recency, never consistency.
  const contentRef = useRef(content);
  contentRef.current = content;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const timerRef = useRef<number | null>(null);

  /** Returns whether the draft on the server now matches what is on screen. */
  const saveNow = useCallback(
    async (overwrite = false): Promise<boolean> => {
      setSaveState('saving');
      setSaveProblems([]);
      try {
        const saved = await putEditorDraft(
          slug,
          contentRef.current,
          overwrite ? undefined : revisionRef.current,
        );
        setRevision(saved.revision);
        setSaveState('saved');
        recordEditorStep('draft_saved');
        return true;
      } catch (error) {
        const status = (error as StudioApiError).status;
        if (status === 409) {
          setSaveState('conflict');
        } else {
          setSaveState('error');
          const problems = (error as StudioApiError).problems;
          setSaveProblems(problems && problems.length > 0 ? problems : [(error as Error).message]);
        }
        return false;
      }
    },
    [slug],
  );

  const scheduleSave = useCallback(() => {
    setSaveState('dirty');
    setPublish((current) => (current.kind === 'published' ? { kind: 'idle' } : current));
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void saveNow();
    }, AUTOSAVE_MS);
  }, [saveNow]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  function updateItem(next: EditorItemContent) {
    if (!collectionKey) return;
    setContent((current) => {
      const list = (current[collectionKey] ?? []).slice();
      list[itemIndex] = next;
      return { ...current, [collectionKey]: list };
    });
    scheduleSave();
  }

  async function reloadNewest() {
    try {
      const loaded = await fetchGameEditor(slug);
      setEditor(loaded);
      setContent(loaded.draft?.content ?? loaded.content);
      setRevision(loaded.draft?.revision ?? 0);
      setItemIndex(0);
      setSaveState('clean');
    } catch {
      setSaveState('error');
    }
  }

  async function discardDraft() {
    try {
      await deleteEditorDraft(slug);
      if (editor) {
        setContent(editor.content);
        setRevision(0);
        setItemIndex(0);
        setSaveState('clean');
      }
    } catch {
      setSaveState('error');
    }
  }

  async function publishNow() {
    // Flush any pending edit first, so what publishes is what the creator sees —
    // and stop if that flush did not land. A rejected save (409 from another tab,
    // 422 from moderation or the schema, or a dropped connection) leaves the
    // server holding an older draft, and publishing it anyway would report
    // success for content the creator is not looking at. The save's own banner
    // already says what went wrong.
    if (timerRef.current !== null || saveState === 'dirty') {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!(await saveNow())) return;
    }
    setPublish({ kind: 'publishing' });
    try {
      const result = await publishEditorContent(slug);
      recordEditorStep('published');
      setPublish({ kind: 'published', version: result.version });
    } catch (error) {
      const status = (error as StudioApiError).status;
      if (status === 429) setPublish({ kind: 'cooldown', retryAfterMs: (error as StudioApiError).retryAfterMs });
      else setPublish({ kind: 'error', message: (error as Error).message });
    }
  }

  if (state === 'loading') {
    return <div className="editor-panel editor-panel-note">{t('studioPanel.editor.loading')}</div>;
  }
  if (state === 'error' || !editor || !spec || !collectionKey) {
    return (
      <div className="editor-panel editor-panel-note">
        {t('studioPanel.editor.loadError')}
        <button type="button" className="studio-head-action" onClick={props.onBack}>
          {t('studioPanel.playtest.backToThread')}
        </button>
      </div>
    );
  }

  const problems = item ? itemProblems(spec.item, item, name) : [];
  const allProblems = items.flatMap((entry, index) => {
    const found = itemProblems(spec.item, entry, name);
    return found.length > 0 ? [`${name(spec.itemLabel)} ${index + 1}`] : [];
  });
  const width = item ? (item.rows[0]?.length ?? 0) : 0;

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
          <button
            type="button"
            className="studio-head-action"
            // Flush first: the panel unmounts on navigation and its cleanup cancels
            // the debounce timer, so a click inside that window would have sent the
            // creator to a playtest of the draft *before* their last edit.
            onClick={() => {
              recordEditorStep('previewed');
              if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
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
            disabled={publish.kind === 'publishing' || allProblems.length > 0}
            onClick={() => void publishNow()}
          >
            {publish.kind === 'publishing' ? t('studioPanel.editor.publishing') : t('studioPanel.editor.publish')}
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
      {publish.kind === 'error' ? (
        <div className="editor-banner" role="alert">
          {publish.message}
        </div>
      ) : null}

      <div className="editor-body">
        <div className="editor-board-col">
          {item ? (
            <>
              <div
                className="editor-board"
                role="grid"
                aria-label={t('studioPanel.editor.boardAria', { name: name(spec.itemLabel) })}
                style={{ gridTemplateColumns: `repeat(${width}, var(--editor-cell))` }}
              >
                {item.rows.map((rowChars, row) =>
                  Array.from(rowChars).map((char, col) => {
                    const tile = spec.item.tiles.find((entry) => entry.char === char);
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
                          const selected = spec.item.tiles.find((entry) => entry.key === tileKey);
                          if (selected) updateItem(setCell(item, row, col, selected.char));
                        }}
                      />
                    );
                  }),
                )}
              </div>
              <div className="editor-palette" role="radiogroup" aria-label={t('studioPanel.editor.tiles')}>
                {spec.item.tiles.map((tile) => (
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
          ) : (
            <div className="editor-panel-note">{t('studioPanel.editor.empty')}</div>
          )}
        </div>

        <aside className="editor-side">
          <div className="editor-side-group">
            <h4>
              {name(spec.label)} <span className="editor-count">{items.length} / {spec.max}</span>
            </h4>
            <ul className="editor-item-list">
              {items.map((entry, index) => (
                <li key={index}>
                  <button
                    type="button"
                    className={index === itemIndex ? 'is-active' : ''}
                    onClick={() => setItemIndex(index)}
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
                        setContent((current) => {
                          const list = (current[collectionKey] ?? []).filter((_, i) => i !== index);
                          return { ...current, [collectionKey]: list };
                        });
                        setItemIndex((current) => Math.max(0, current > index ? current - 1 : Math.min(current, items.length - 2)));
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
                  setContent((current) => ({
                    ...current,
                    [collectionKey]: [...(current[collectionKey] ?? []), blankItem(spec.item)],
                  }));
                  setItemIndex(items.length);
                  scheduleSave();
                }}
              >
                ＋ {t('studioPanel.editor.addItem', { name: name(spec.itemLabel) })}
              </button>
            ) : null}
          </div>

          {item ? (
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
                          updateItem({ ...item, properties: { ...item.properties, [propertyName]: event.target.value } })
                        }
                      />
                    </label>
                  );
                }
                if (propertySpec.type === 'int' || propertySpec.type === 'number') {
                  return (
                    <label key={propertyName} className="editor-prop">
                      <span>
                        {propertyName} <em>{propertySpec.min}–{propertySpec.max}</em>
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
                          updateItem({ ...item, properties: { ...item.properties, [propertyName]: event.target.value } })
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
                        updateItem({ ...item, properties: { ...item.properties, [propertyName]: event.target.checked } })
                      }
                    />
                  </label>
                );
              })}
            </div>
          ) : null}

          <div className="editor-side-group">
            <h4>{t('studioPanel.editor.checks')}</h4>
            {problems.length === 0 ? (
              <p className="editor-check is-ok">✓ {t('studioPanel.editor.checksOk')}</p>
            ) : (
              problems.map((problem) => (
                <p key={problem} className="editor-check is-bad">
                  ✕ {problem}
                </p>
              ))
            )}
            {allProblems.length > 0 ? (
              <p className="editor-check is-bad">{t('studioPanel.editor.checksElsewhere', { list: allProblems.join(', ') })}</p>
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
