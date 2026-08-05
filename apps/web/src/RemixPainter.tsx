import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { blankItem, itemProblems, setCell } from './editorContentTools.js';
import type { EditorCollectionSpec, EditorContentDoc, EditorItemContent, EditorLabel } from './studioApi.js';

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

export function RemixPainter(props: {
  content: Record<string, EditorCollectionSpec>;
  doc: EditorContentDoc;
  onChange: (next: EditorContentDoc) => void;
}) {
  const { t, i18n } = useTranslation();
  const name = (label: EditorLabel) => (i18n.language?.startsWith('pl') ? label.pl : label.en);

  // One collection is the vocabulary's reality today; the first is the surface.
  const collectionKey = Object.keys(props.content)[0] ?? null;
  const spec = collectionKey ? props.content[collectionKey] : null;
  const items = collectionKey
    ? (((props.doc[collectionKey] as EditorItemContent[] | undefined) ?? []) as EditorItemContent[])
    : [];
  const [itemIndex, setItemIndex] = useState(0);
  const [tileKey, setTileKey] = useState<string | null>(spec?.item.tiles[0]?.key ?? null);
  const item = items[Math.min(itemIndex, Math.max(0, items.length - 1))] ?? null;
  const activeIndex = Math.min(itemIndex, Math.max(0, items.length - 1));

  if (!spec || !collectionKey) return null;

  function updateItems(list: EditorItemContent[]) {
    props.onChange({ ...props.doc, [collectionKey as string]: list });
  }

  function updateItem(next: EditorItemContent) {
    const list = items.slice();
    list[activeIndex] = next;
    updateItems(list);
  }

  const problems = item ? itemProblems(spec.item, item, name) : [];
  const width = item ? (item.rows[0]?.length ?? 0) : 0;

  return (
    <div className="remix-painter">
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

      {item ? (
        <>
          <div
            className="editor-board"
            role="grid"
            aria-label={name(spec.itemLabel)}
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
          {/*
           * Verdicts, not vetoes: nothing here blocks anything (there is no save
           * to refuse), but a map that breaks its own game's rules should say so
           * before the player wonders why their level cannot be won.
           */}
          {problems.length > 0 ? (
            <div className="remix-painter-checks" role="status">
              {problems.slice(0, 3).map((problem) => (
                <p key={problem} className="editor-check is-bad">
                  ✕ {problem}
                </p>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
