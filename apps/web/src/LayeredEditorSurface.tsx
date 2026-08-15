import type {
  EditorEntityItemContent,
  EditorLayerSpec,
  EditorLayersDoc,
  EditorLabel,
  EditorPropertySpec,
  EditorTilemapItemContent,
} from './studioApi.js';
import { blankLayerEntity } from './editorContentTools.js';

type LayeredBaseProps = {
  layers: Record<string, EditorLayerSpec>;
  content: EditorLayersDoc;
  activeLayerKey: string | null;
  editableLayerKey?: string | null;
  name: (label: EditorLabel) => string;
  onLayerChange: (key: string) => void;
  onChange: (next: EditorLayersDoc) => void;
  readOnlyLabel?: string;
};

type LayeredBoardProps = LayeredBaseProps & {
  tileKey: string | null;
  onTileKeyChange: (key: string) => void;
};

type LayeredSidebarProps = LayeredBaseProps & {
  entityIndex: number;
  onEntityIndexChange: (index: number) => void;
};

function tilemapContent(value: unknown): value is EditorTilemapItemContent {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'properties' in value &&
    'rows' in value &&
    Array.isArray(value.rows) &&
    value.rows.every((row) => typeof row === 'string')
  );
}

function entityContent(value: unknown): value is EditorEntityItemContent[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        'properties' in item &&
        typeof item.properties === 'object' &&
        item.properties !== null,
    )
  );
}

function canEdit(activeLayerKey: string | null, editableLayerKey: string | null | undefined): boolean {
  return Boolean(activeLayerKey && (editableLayerKey === undefined || editableLayerKey === activeLayerKey));
}

function updateProperties(
  content: EditorLayersDoc,
  key: string,
  properties: Record<string, unknown>,
  onChange: (next: EditorLayersDoc) => void,
) {
  const current = content[key];
  if (!current || typeof current !== 'object' || Array.isArray(current)) return;
  onChange({ ...content, [key]: { ...current, properties } } as EditorLayersDoc);
}

function propertyFields(
  properties: Record<string, EditorPropertySpec>,
  values: Record<string, unknown>,
  onChange: (name: string, value: unknown) => void,
) {
  return Object.entries(properties).map(([propertyName, propertySpec]) => {
    const value = values[propertyName];
    if (propertySpec.type === 'text') {
      return (
        <label key={propertyName} className="editor-prop">
          <span>{propertyName}</span>
          <input
            type="text"
            maxLength={propertySpec.max}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(propertyName, event.target.value)}
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
              if (Number.isFinite(parsed))
                onChange(propertyName, propertySpec.type === 'int' ? Math.round(parsed) : parsed);
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
            onChange={(event) => onChange(propertyName, event.target.value)}
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
          onChange={(event) => onChange(propertyName, event.target.checked)}
        />
      </label>
    );
  });
}

export function LayeredBoard({
  layers,
  content,
  activeLayerKey,
  editableLayerKey,
  name,
  onChange,
  tileKey,
  onTileKeyChange,
  readOnlyLabel = 'Layer is read-only',
}: LayeredBoardProps) {
  const tilemapLayers = Object.entries(layers).filter(([, spec]) => spec.widget === 'tilemap');
  const editable = canEdit(activeLayerKey, editableLayerKey);
  const activeSpec = activeLayerKey ? layers[activeLayerKey] : undefined;
  const activeValue = activeLayerKey ? content[activeLayerKey] : undefined;
  const activeTilemap = activeSpec?.widget === 'tilemap' && tilemapContent(activeValue) ? activeValue : null;

  return (
    <div className="editor-layered-board-col">
      {tilemapLayers.length > 0 ? (
        <div className="editor-layer-stack" aria-label="Layered board">
          {tilemapLayers.map(([key, spec]) => {
            const value = content[key];
            if (spec.widget !== 'tilemap' || !tilemapContent(value)) return null;
            const isActive = key === activeLayerKey;
            const layerEditable = isActive && editable;
            const layerWidth = value.rows[0]?.length ?? 0;
            return (
              <div
                key={key}
                className={`editor-layer-board${isActive ? ' is-active' : ''}${isActive ? '' : ' is-muted'}`}
                data-layer-key={key}
                aria-hidden={isActive ? undefined : true}
              >
                <div
                  className="editor-board"
                  role="grid"
                  aria-label={name(spec.label)}
                  style={{ gridTemplateColumns: `repeat(${layerWidth}, var(--editor-cell))` }}
                >
                  {value.rows.map((rowChars, row) =>
                    Array.from(rowChars).map((char, col) => {
                      const tile = spec.tiles.find((entry) => entry.char === char);
                      return (
                        <button
                          key={`${key}-${row}-${col}`}
                          type="button"
                          role="gridcell"
                          tabIndex={layerEditable ? 0 : -1}
                          disabled={!layerEditable}
                          className={`editor-cell${tile?.color ? '' : ` tile-${tile?.key ?? 'unknown'}`}`}
                          {...(tile?.color ? { style: { background: tile.color } } : {})}
                          aria-label={`${row + 1},${col + 1}: ${tile ? name(tile.label) : char}`}
                          onClick={() => {
                            const selected = spec.tiles.find((entry) => entry.key === tileKey);
                            if (!selected || !layerEditable) return;
                            const rows = value.rows.slice();
                            rows[row] = rows[row].slice(0, col) + selected.char + rows[row].slice(col + 1);
                            onChange({ ...content, [key]: { ...value, rows } });
                          }}
                        />
                      );
                    }),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="editor-panel-note">No tilemap layers</div>
      )}

      {activeSpec?.widget === 'tilemap' ? (
        <div className="editor-palette" role="radiogroup" aria-label={name(activeSpec.label)}>
          {activeSpec.tiles.map((tile) => (
            <button
              key={tile.key}
              type="button"
              role="radio"
              aria-checked={tileKey === tile.key}
              disabled={!editable}
              className={`editor-tile${tileKey === tile.key ? ' is-selected' : ''}`}
              onClick={() => onTileKeyChange(tile.key)}
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
      ) : null}

      {activeSpec?.widget === 'entities' && !activeTilemap ? (
        <div className="editor-panel-note">{name(activeSpec.label)}</div>
      ) : null}

      {activeLayerKey && activeSpec && !editable ? <p className="editor-layer-readonly">{readOnlyLabel}</p> : null}
    </div>
  );
}

export function LayeredSidebar({
  layers,
  content,
  activeLayerKey,
  editableLayerKey,
  name,
  onLayerChange,
  onChange,
  entityIndex,
  onEntityIndexChange,
  readOnlyLabel = 'Layer is read-only',
}: LayeredSidebarProps) {
  const activeSpec = activeLayerKey ? layers[activeLayerKey] : undefined;
  const activeValue = activeLayerKey ? content[activeLayerKey] : undefined;
  const editable = canEdit(activeLayerKey, editableLayerKey);
  const entities = activeSpec?.widget === 'entities' && entityContent(activeValue) ? activeValue : [];
  const activeEntityIndex = Math.min(entityIndex, Math.max(0, entities.length - 1));
  const activeEntity = entities[activeEntityIndex];

  function updateEntity(next: EditorEntityItemContent) {
    if (!activeLayerKey || !editable || !activeEntity) return;
    const nextEntities = entities.slice();
    nextEntities[activeEntityIndex] = next;
    onChange({ ...content, [activeLayerKey]: nextEntities });
  }

  return (
    <div className="editor-layer-sidebar">
      <div className="editor-side-group">
        <h4>Layers</h4>
        <div className="editor-layer-picker" role="listbox" aria-label="Layers">
          {Object.entries(layers).map(([key, spec]) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={key === activeLayerKey}
              className={`editor-layer-picker-item${key === activeLayerKey ? ' is-active' : ''}`}
              onClick={() => onLayerChange(key)}
            >
              <span>{name(spec.label)}</span>
              <small>{spec.widget}</small>
            </button>
          ))}
        </div>
        {activeLayerKey && !editable ? <p className="editor-layer-readonly">{readOnlyLabel}</p> : null}
      </div>

      {activeSpec?.widget === 'entities' ? (
        <div className="editor-side-group">
          <h4>
            {name(activeSpec.label)}{' '}
            <span className="editor-count">
              {entities.length} / {activeSpec.max}
            </span>
          </h4>
          <ul className="editor-item-list">
            {entities.map((_, index) => (
              <li key={index}>
                <button
                  type="button"
                  className={index === activeEntityIndex ? 'is-active' : ''}
                  onClick={() => onEntityIndexChange(index)}
                >
                  {`${name(activeSpec.label)} ${index + 1}`}
                </button>
                {editable && entities.length > activeSpec.min ? (
                  <button
                    type="button"
                    className="editor-item-remove"
                    aria-label="Remove item"
                    onClick={() => {
                      onChange({ ...content, [activeLayerKey!]: entities.filter((_, item) => item !== index) });
                      onEntityIndexChange(Math.max(0, Math.min(activeEntityIndex, entities.length - 2)));
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {editable && entities.length < activeSpec.max ? (
            <button
              type="button"
              className="editor-add"
              onClick={() => {
                onChange({ ...content, [activeLayerKey!]: [...entities, blankLayerEntity(activeSpec)] });
                onEntityIndexChange(entities.length);
              }}
            >
              ＋ Add {name(activeSpec.label)}
            </button>
          ) : null}
        </div>
      ) : null}

      {activeSpec?.widget === 'tilemap' && tilemapContent(activeValue) ? (
        <div className="editor-side-group">
          <h4>Properties</h4>
          {propertyFields(activeSpec.properties, activeValue.properties, (propertyName, value) => {
            if (editable && activeLayerKey) {
              updateProperties(content, activeLayerKey, { ...activeValue.properties, [propertyName]: value }, onChange);
            }
          })}
        </div>
      ) : null}

      {activeSpec?.widget === 'entities' && activeEntity ? (
        <div className="editor-side-group">
          <h4>Properties</h4>
          {propertyFields(activeSpec.properties, activeEntity.properties, (propertyName, value) => {
            if (editable)
              updateEntity({ ...activeEntity, properties: { ...activeEntity.properties, [propertyName]: value } });
          })}
        </div>
      ) : null}
    </div>
  );
}
