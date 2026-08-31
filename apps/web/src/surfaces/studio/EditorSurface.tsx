import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditorControllerState, EditorUiField, EditorUiLabel, EditorUiNode } from '../../editorBridge.js';
import './editor-controller.css';

function labelText(label: EditorUiLabel, language: string): string {
  return typeof label === 'string' ? label : language.startsWith('pl') ? label.pl : label.en;
}

function childrenOf(node: EditorUiNode | EditorUiNode[]): EditorUiNode[] {
  return Array.isArray(node) ? node : [node];
}

function fieldValue(field: EditorUiField): string | number | boolean {
  if (field.value !== undefined) return field.value;
  if (field.type === 'bool') return false;
  if (field.type === 'text') return '';
  return field.min ?? 0;
}

function EditorField({
  field,
  language,
  onChange,
}: {
  field: EditorUiField;
  language: string;
  onChange: (value: unknown) => void;
}) {
  const value = fieldValue(field);
  if (field.type === 'bool') {
    return (
      <label className="editor-prop">
        <span>{labelText(field.label, language)}</span>
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
      </label>
    );
  }
  if (field.type === 'enum') {
    return (
      <label className="editor-prop">
        <span>{labelText(field.label, language)}</span>
        <select value={String(value)} onChange={(event) => onChange(event.target.value)}>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="editor-prop">
      <span>{labelText(field.label, language)}</span>
      <input
        type={field.type === 'text' ? 'text' : 'number'}
        min={field.min}
        max={field.max}
        step={field.type === 'int' ? 1 : field.type === 'number' ? 'any' : undefined}
        value={String(value)}
        onChange={(event) => {
          if (field.type === 'text') onChange(event.target.value);
          else {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(field.type === 'int' ? Math.round(parsed) : parsed);
          }
        }}
      />
    </label>
  );
}

function EditorNode({
  node,
  language,
  controller,
}: {
  node: EditorUiNode;
  language: string;
  controller: EditorControllerState;
}) {
  if (node.type === 'rail' || node.type === 'panel' || node.type === 'group') {
    return (
      <section className={`editor-controller-${node.type}`}>
        {'title' in node && node.title ? <h4>{labelText(node.title, language)}</h4> : null}
        {node.children.map((child, index) => (
          <EditorNode key={index} node={child} language={language} controller={controller} />
        ))}
      </section>
    );
  }
  if (node.type === 'tabs') {
    return (
      <div className="editor-controller-tabs" role="tablist">
        {node.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={node.active === tab.id ? 'is-active' : ''}
            onClick={() => controller.sendEvent({ type: 'tabSelect', id: tab.id })}
          >
            {labelText(tab.label, language)}
          </button>
        ))}
      </div>
    );
  }
  if (node.type === 'toolbar') {
    return (
      <div className="editor-controller-toolbar" role="toolbar">
        {node.tools.map((tool) => (
          <button
            key={tool}
            type="button"
            className={node.active === tool ? 'is-active' : ''}
            onClick={() => controller.sendEvent({ type: 'toolSelect', tool })}
          >
            {tool}
          </button>
        ))}
      </div>
    );
  }
  if (node.type === 'board') {
    const rows = node.rows ?? [];
    const columns = rows[0]?.length ?? 0;
    return (
      <div className="editor-controller-board">
        <div className="editor-controller-layer-tabs" role="tablist">
          {node.layers.map((layer) => (
            <button
              key={layer}
              type="button"
              className={node.active === layer ? 'is-active' : ''}
              onClick={() => {
                controller.sendSelection({ layer, index: null });
                controller.sendEvent({ type: 'layerSelect', layer });
              }}
            >
              {layer}
            </button>
          ))}
        </div>
        {rows.length > 0 && columns > 0 ? (
          <div
            className="editor-board editor-controller-grid"
            role="grid"
            style={{ gridTemplateColumns: `repeat(${columns}, var(--editor-cell))` }}
          >
            {rows.flatMap((row, rowIndex) =>
              Array.from(row).map((char, columnIndex) => (
                <button
                  key={`${rowIndex}-${columnIndex}`}
                  type="button"
                  className="editor-cell"
                  role="gridcell"
                  onClick={() =>
                    controller.sendEvent({
                      type: 'cellClick',
                      layer: node.active,
                      row: rowIndex,
                      col: columnIndex,
                      char,
                    })
                  }
                >
                  {char}
                </button>
              )),
            )}
          </div>
        ) : (
          <p className="editor-panel-note">
            {language.startsWith('pl') ? 'Plansza jest renderowana przez grę.' : 'The game supplies the live board.'}
          </p>
        )}
      </div>
    );
  }
  if (node.type === 'palette') {
    return (
      <div className="editor-palette" role="radiogroup">
        {(node.tiles ?? []).map((tile) => (
          <button
            key={tile.key}
            type="button"
            className="editor-tile"
            onClick={() => controller.sendEvent({ type: 'tileSelect', layer: node.layer, tile: tile.key })}
          >
            <span
              className="editor-tile-swatch"
              style={tile.color ? { background: tile.color } : undefined}
              aria-hidden="true"
            />
            {labelText(tile.label, language)}
          </button>
        ))}
      </div>
    );
  }
  if (node.type === 'propertySheet') {
    return (
      <div className="editor-side-group editor-controller-property-sheet">
        <h4>
          {node.layer} #{node.index + 1}
        </h4>
        {(node.fields ?? []).map((field) => (
          <EditorField
            key={field.name}
            field={field}
            language={language}
            onChange={(value) =>
              controller.sendEvent({ type: 'fieldEdit', layer: node.layer, index: node.index, name: field.name, value })
            }
          />
        ))}
      </div>
    );
  }
  if (node.type === 'list') {
    return (
      <ul className="editor-item-list editor-controller-list">
        {node.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === node.selected ? 'is-active' : ''}
              onClick={() => controller.sendEvent({ type: 'listSelect', id: item.id })}
            >
              {labelText(item.label, language)}
            </button>
            {item.detail ? <small>{labelText(item.detail, language)}</small> : null}
          </li>
        ))}
      </ul>
    );
  }
  if (node.type === 'note') return <p className="editor-panel-note">{labelText(node.text, language)}</p>;
  if (node.type !== 'check') return null;
  return (
    <p className={`editor-check ${node.ok ? 'is-ok' : 'is-bad'}`}>
      {node.ok ? '✓' : '✕'} {labelText(node.text, language)}
    </p>
  );
}

export function EditorSurface({ controller }: { controller: EditorControllerState }) {
  const { i18n } = useTranslation();
  const language = i18n.language ?? 'en';
  const request = controller.uiRequest;
  const [values, setValues] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (!request) return;
    const initial = Object.fromEntries(
      (request.spec.fields ?? []).map((field) => [field.name, field.value ?? fieldValue(field)]),
    );
    setValues(initial);
  }, [request]);

  const nodes = useMemo(() => (controller.view ? childrenOf(controller.view) : []), [controller.view]);
  return (
    <div className="editor-controller-surface" data-controller-status={controller.status}>
      {controller.reason ? (
        <p className="editor-banner" role="status">
          {controller.reason}
        </p>
      ) : null}
      {nodes.map((node, index) => (
        <EditorNode key={index} node={node} language={language} controller={controller} />
      ))}
      {controller.checks && !controller.checks.ok
        ? controller.checks.problems.map((problem) => (
            <p className="editor-check is-bad" key={problem}>
              ✕ {problem}
            </p>
          ))
        : null}
      {request?.spec.kind === 'toast' ? (
        <div className="editor-controller-modal" role="status">
          <p>{request.spec.text ? labelText(request.spec.text, language) : ''}</p>
          <button type="button" onClick={() => controller.sendUiResult(request.id, null)}>
            OK
          </button>
        </div>
      ) : null}
      {request?.spec.kind === 'confirm' ? (
        <div className="editor-controller-modal" role="dialog" aria-modal="true">
          <h4>{request.spec.title ? labelText(request.spec.title, language) : ''}</h4>
          <p>{request.spec.message ? labelText(request.spec.message, language) : ''}</p>
          <button type="button" onClick={() => controller.sendUiResult(request.id, true)}>
            OK
          </button>
          <button type="button" onClick={() => controller.sendUiResult(request.id, false, true)}>
            Cancel
          </button>
        </div>
      ) : null}
      {request?.spec.kind === 'form' ? (
        <div className="editor-controller-modal" role="dialog" aria-modal="true">
          <h4>{request.spec.title ? labelText(request.spec.title, language) : ''}</h4>
          {(request.spec.fields ?? []).map((field) => (
            <EditorField
              key={field.name}
              field={{ ...field, value: values[field.name] as never }}
              language={language}
              onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
            />
          ))}
          <button type="button" onClick={() => controller.sendUiResult(request.id, values)}>
            OK
          </button>
          <button type="button" onClick={() => controller.sendUiResult(request.id, null, true)}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
