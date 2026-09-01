import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PathPainter } from './PathPainter.js';
import { LayeredBoard, LayeredSidebar } from './LayeredEditorSurface.js';
import {
  blankItem,
  collectionProblems,
  defaultCollectionKey,
  defaultLayerTileKey,
  isPathItem,
  isTilemapItem,
  itemProblems,
  layerProblems,
  layeredProblems,
  setCell,
} from './editorContentTools.js';
import type {
  EditorCollectionSpec,
  EditorContentDoc,
  EditorLayerConstraint,
  EditorLayerSpec,
  EditorLayersDoc,
  EditorItemContent,
  EditorLabel,
  EditorPathSpec,
  EditorTilemapSpec,
} from './studioApi.js';
import type { EditorSelection } from './editorBridge.js';
import './editor-kit.css';
import './editor-kit-side.css';
import './remix-painter.css';

/** Narrows a collection to its tilemap spec — entities render no board. */
function tilemapCollection(
  spec: EditorCollectionSpec | null,
): (EditorCollectionSpec & { item: EditorTilemapSpec }) | null {
  return spec && spec.item.widget === 'tilemap' ? (spec as EditorCollectionSpec & { item: EditorTilemapSpec }) : null;
}

function pathCollection(spec: EditorCollectionSpec | null): (EditorCollectionSpec & { item: EditorPathSpec }) | null {
  return spec && spec.item.widget === 'path' ? (spec as EditorCollectionSpec & { item: EditorPathSpec }) : null;
}

/** The palette's initial selection — entities have no tiles to paint with. */
function firstTileKey(spec: EditorCollectionSpec | null | undefined): string | null {
  if (!spec || spec.item.widget !== 'tilemap') return null;
  return spec.item.tiles.find((tile) => tile.key.length > 0)?.key ?? null;
}

/**
 * The declared content painter for remix.
 *
 * Hosted in the full-bleed editor stage (not the remix chat sheet). The
 * Studio's EditorPanel renders the same vocabulary for creators; this is the
 * player-shaped cut — one column, thumb-sized cells, no drafts and no publish.
 * Paintings live in the session and reach the game over the bridge exactly
 * like a slider move. The constraint mirror is shared (`editorContentTools`),
 * so a remixer who walls off a seed is told so live — their content never
 * reaches the server, which makes the live check the *only* check they see.
 */

type RemixPainterProps = {
  content?: Record<string, EditorCollectionSpec>;
  layers?: Record<string, EditorLayerSpec> | null;
  constraints?: EditorLayerConstraint[] | null;
  doc: EditorContentDoc;
  onChange: (next: EditorContentDoc) => void;
  selectedCollectionKey?: string | null;
  onCollectionChange?: (key: string) => void;
  selectedLayerKey?: string | null;
  onLayerChange?: (key: string) => void;
  onSelectionChange?: (selection: EditorSelection) => void;
};

function CollectionRemixPainter(props: RemixPainterProps & { content: Record<string, EditorCollectionSpec> }) {
  const { t, i18n } = useTranslation();
  const name = (label: EditorLabel) => (i18n.language?.startsWith('pl') ? label.pl : label.en);
  const pathMessages = {
    pointCount: (count: number, min: number, max: number) =>
      t('studioPanel.editor.pathPointCount', { count, min, max }),
    outOfBounds: (index: number) => t('studioPanel.editor.pathOutOfBounds', { index }),
    distinct: () => t('studioPanel.editor.pathDistinct'),
    repeatedEnd: () => t('studioPanel.editor.pathRepeatedEnd'),
  };

  const collectionKeys = Object.keys(props.content);
  const [internalCollectionKey, setInternalCollectionKey] = useState<string | null>(null);
  const requestedCollectionKey =
    props.selectedCollectionKey !== undefined ? props.selectedCollectionKey : internalCollectionKey;
  const collectionKey =
    requestedCollectionKey && props.content[requestedCollectionKey]
      ? requestedCollectionKey
      : defaultCollectionKey(props.content);
  const spec = collectionKey ? props.content[collectionKey] : null;
  const items = collectionKey
    ? (((props.doc[collectionKey] as EditorItemContent[] | undefined) ?? []) as EditorItemContent[])
    : [];
  const [itemIndex, setItemIndex] = useState(0);
  const [tileKey, setTileKey] = useState<string | null>(firstTileKey(spec));

  useEffect(() => {
    setItemIndex(0);
    setTileKey(firstTileKey(spec));
  }, [collectionKey, spec]);

  const item = items[Math.min(itemIndex, Math.max(0, items.length - 1))] ?? null;
  const activeIndex = Math.min(itemIndex, Math.max(0, items.length - 1));
  const onSelectionChangeRef = useRef(props.onSelectionChange);
  onSelectionChangeRef.current = props.onSelectionChange;

  useEffect(() => {
    if (!collectionKey) return;
    onSelectionChangeRef.current?.({ collection: collectionKey, index: activeIndex });
  }, [collectionKey, activeIndex]);

  if (!spec || !collectionKey) return null;
  const activeCollectionKey = collectionKey;

  function selectCollection(nextKey: string) {
    if (!props.content[nextKey]) return;
    if (props.selectedCollectionKey === undefined) setInternalCollectionKey(nextKey);
    props.onCollectionChange?.(nextKey);
    setItemIndex(0);
    setTileKey(firstTileKey(props.content[nextKey]));
  }

  function updateItems(list: EditorItemContent[]) {
    props.onChange({ ...props.doc, [activeCollectionKey]: list });
  }

  function updateItem(next: EditorItemContent) {
    const list = items.slice();
    list[activeIndex] = next;
    updateItems(list);
  }

  const problems = item ? itemProblems(spec.item, item, name, pathMessages) : [];
  const collectionWideProblems = collectionProblems(spec, items);
  const tilemapItem = item && isTilemapItem(item) ? item : null;
  const pathItem = item && isPathItem(item) ? item : null;
  const boardSpec = tilemapCollection(spec);
  const pathSpec = pathCollection(spec);
  const width = tilemapItem ? (tilemapItem.rows[0]?.length ?? 0) : 0;

  return (
    <div className="remix-painter">
      {collectionKeys.length > 1 ? (
        <label className="editor-collection-selector remix-painter-collection-selector">
          <span>{t('studioPanel.editor.collection')}</span>
          <select
            value={collectionKey}
            aria-label={t('studioPanel.editor.collection')}
            onChange={(event) => selectCollection(event.target.value)}
          >
            {collectionKeys.map((key) => (
              <option key={key} value={key}>
                {name(props.content[key].label)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="remix-painter-items" role="tablist" aria-label={name(spec.label)}>
        {items.map((entry, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            className={`remix-painter-item${index === activeIndex ? ' is-active' : ''}`}
            onClick={() => setItemIndex(index)}
          >
            {typeof entry.properties.name === 'string' && entry.properties.name
              ? entry.properties.name
              : `${name(spec.itemLabel)} ${index + 1}`}
          </button>
        ))}
        {items.length < spec.max ? (
          <button
            type="button"
            className="remix-painter-item is-add"
            aria-label={t('studioPanel.editor.addItem', { name: name(spec.itemLabel) })}
            onClick={() => {
              updateItems([...items, blankItem(spec.item)]);
              setItemIndex(items.length);
            }}
          >
            ＋
          </button>
        ) : null}
        {items.length > spec.min ? (
          <button
            type="button"
            className="remix-painter-item is-remove"
            aria-label={t('studioPanel.editor.removeItem')}
            onClick={() => {
              updateItems(items.filter((_, index) => index !== activeIndex));
              setItemIndex((current) => Math.max(0, Math.min(current, items.length - 2)));
            }}
          >
            −
          </button>
        ) : null}
      </div>

      {boardSpec && tilemapItem ? (
        <>
          <div
            className="editor-board"
            role="grid"
            aria-label={name(boardSpec.itemLabel)}
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
      ) : null}

      {pathSpec && pathItem ? (
        <PathPainter
          key={`${collectionKey}-${activeIndex}`}
          spec={pathSpec.item}
          item={pathItem}
          ariaLabel={t('studioPanel.editor.pathAria', { name: name(pathSpec.itemLabel) })}
          instructions={t('studioPanel.editor.pathHelp')}
          onChange={updateItem}
        />
      ) : null}

      {item && spec ? (
        <div className="remix-painter-properties">
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

      {/*
       * Verdicts, not vetoes: nothing here blocks anything (there is no save
       * to refuse), but content that breaks its own game's rules should say so
       * before the player wonders why their level cannot be won.
       */}
      {problems.length > 0 || collectionWideProblems.length > 0 ? (
        <div className="remix-painter-checks" role="status">
          {[...problems, ...collectionWideProblems].slice(0, 3).map((problem) => (
            <p key={problem} className="editor-check is-bad">
              ✕ {problem}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LayeredRemixPainter(props: RemixPainterProps & { layers: Record<string, EditorLayerSpec> }) {
  const { t, i18n } = useTranslation();
  const name = (label: EditorLabel) => (i18n.language?.startsWith('pl') ? label.pl : label.en);
  const layerKeys = Object.keys(props.layers);
  const topLayerKey = layerKeys[layerKeys.length - 1] ?? null;
  const [internalLayerKey, setInternalLayerKey] = useState<string | null>(null);
  const requestedLayerKey = props.selectedLayerKey !== undefined ? props.selectedLayerKey : internalLayerKey;
  const activeLayerKey = requestedLayerKey && props.layers[requestedLayerKey] ? requestedLayerKey : topLayerKey;
  const [tileKey, setTileKey] = useState<string | null>(defaultLayerTileKey(props.layers, activeLayerKey));
  const [entityIndex, setEntityIndex] = useState(0);
  const layersContent = (props.doc.layers ?? {}) as EditorLayersDoc;

  useEffect(() => {
    setTileKey(defaultLayerTileKey(props.layers, activeLayerKey));
    setEntityIndex(0);
  }, [activeLayerKey, props.layers]);

  const onSelectionChangeRef = useRef(props.onSelectionChange);
  onSelectionChangeRef.current = props.onSelectionChange;
  useEffect(() => {
    if (activeLayerKey) onSelectionChangeRef.current?.({ collection: activeLayerKey, index: 0 });
  }, [activeLayerKey]);

  if (!activeLayerKey) return null;
  const activeSpec = props.layers[activeLayerKey];
  const updateLayers = (nextLayers: EditorLayersDoc) => props.onChange({ ...props.doc, layers: nextLayers });
  const selectLayer = (nextKey: string) => {
    if (!props.layers[nextKey]) return;
    if (props.selectedLayerKey === undefined) setInternalLayerKey(nextKey);
    props.onLayerChange?.(nextKey);
    setEntityIndex(0);
    setTileKey(defaultLayerTileKey(props.layers, nextKey));
  };
  const problems = layerProblems(activeSpec, layersContent[activeLayerKey], name);
  const wideProblems = layeredProblems(props.layers, props.constraints ?? undefined, layersContent);

  return (
    <div className="remix-painter remix-layered-painter">
      <div className="editor-layered-remix-grid">
        <LayeredBoard
          layers={props.layers}
          content={layersContent}
          activeLayerKey={activeLayerKey}
          editableLayerKey={topLayerKey}
          name={name}
          tileKey={tileKey}
          onTileKeyChange={setTileKey}
          onLayerChange={selectLayer}
          onChange={updateLayers}
          readOnlyLabel={t('studioPanel.editor.readOnlyLayer')}
        />
        <LayeredSidebar
          layers={props.layers}
          content={layersContent}
          activeLayerKey={activeLayerKey}
          editableLayerKey={topLayerKey}
          name={name}
          entityIndex={entityIndex}
          onEntityIndexChange={setEntityIndex}
          onLayerChange={selectLayer}
          onChange={updateLayers}
          readOnlyLabel={t('studioPanel.editor.readOnlyLayer')}
        />
      </div>
      {problems.length > 0 || wideProblems.length > 0 ? (
        <div className="remix-painter-checks" role="status">
          {[...problems, ...wideProblems].slice(0, 3).map((problem) => (
            <p key={problem} className="editor-check is-bad">
              ✕ {problem}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RemixPainter(props: RemixPainterProps) {
  if (props.layers && Object.keys(props.layers).length > 0)
    return <LayeredRemixPainter {...props} layers={props.layers} />;
  if (!props.content || Object.keys(props.content).length === 0) return null;
  return <CollectionRemixPainter {...props} content={props.content} />;
}
