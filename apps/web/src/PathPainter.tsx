import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { EditorPathItemContent, EditorPathPoint, EditorPathSpec } from './studioApi.js';

const MAX_EDITOR_WIDTH = 620;
const MAX_EDITOR_HEIGHT = 520;
const MIN_EDITOR_CELL = 24;

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max - 1, value));
}

export function PathPainter(props: {
  spec: EditorPathSpec;
  item: EditorPathItemContent;
  ariaLabel: string;
  instructions: string;
  onChange: (next: EditorPathItemContent) => void;
}) {
  const instructionsId = useId();
  const [cursor, setCursor] = useState<EditorPathPoint>(() => props.item.points.at(-1) ?? { x: 0, y: 0 });
  const cursorRef = useRef(cursor);
  const dragging = useRef<number | null>(null);
  const suppressNextClick = useRef(false);

  function moveCursor(point: EditorPathPoint) {
    cursorRef.current = point;
    setCursor(point);
  }

  function pointFromPointer(event: { currentTarget: SVGSVGElement; clientX: number; clientY: number }): EditorPathPoint | null {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: clamp(Math.floor(((event.clientX - bounds.left) / bounds.width) * props.spec.gridCols), props.spec.gridCols),
      y: clamp(Math.floor(((event.clientY - bounds.top) / bounds.height) * props.spec.gridRows), props.spec.gridRows),
    };
  }

  function append(point: EditorPathPoint) {
    if (props.item.points.length >= props.spec.maxPoints) return;
    props.onChange({ ...props.item, points: [...props.item.points, point] });
  }

  function movePoint(index: number, point: EditorPathPoint) {
    const points = props.item.points.slice();
    points[index] = point;
    props.onChange({ ...props.item, points });
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const current = cursorRef.current;
    const moves: Record<string, EditorPathPoint> = {
      ArrowLeft: { x: current.x - 1, y: current.y },
      ArrowRight: { x: current.x + 1, y: current.y },
      ArrowUp: { x: current.x, y: current.y - 1 },
      ArrowDown: { x: current.x, y: current.y + 1 },
    };
    const next = moves[event.key];
    if (next) {
      event.preventDefault();
      moveCursor({ x: clamp(next.x, props.spec.gridCols), y: clamp(next.y, props.spec.gridRows) });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      append(cursorRef.current);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      props.onChange({ ...props.item, points: props.item.points.slice(0, -1) });
    }
  }

  const drawPoints = props.spec.closed && props.item.points.length > 1
    ? [...props.item.points, props.item.points[0]]
    : props.item.points;
  const fitWidth = Math.min(
    MAX_EDITOR_WIDTH,
    MAX_EDITOR_HEIGHT * (props.spec.gridCols / props.spec.gridRows),
  );
  const sizing = {
    '--editor-path-fit-width': `${fitWidth}px`,
    '--editor-path-min-width': `${props.spec.gridCols * MIN_EDITOR_CELL}px`,
    '--editor-path-min-height': `${props.spec.gridRows * MIN_EDITOR_CELL}px`,
    '--editor-path-aspect': `${props.spec.gridCols} / ${props.spec.gridRows}`,
  } as CSSProperties;

  return (
    <div className="editor-path-wrap">
      <div className="editor-path-viewport">
        <svg
          className="editor-path"
          style={sizing}
          viewBox={`0 0 ${props.spec.gridCols} ${props.spec.gridRows}`}
          role="application"
          tabIndex={0}
          aria-label={props.ariaLabel}
          aria-describedby={instructionsId}
          onKeyDown={onKeyDown}
          onClick={(event) => {
            if (suppressNextClick.current) {
              suppressNextClick.current = false;
              return;
            }
            if ((event.target as Element).closest('.editor-path-point')) return;
            const point = pointFromPointer(event);
            if (point) {
              moveCursor(point);
              append(point);
            }
          }}
          onPointerMove={(event) => {
            const point = pointFromPointer(event);
            if (!point) return;
            moveCursor(point);
            if (dragging.current !== null) movePoint(dragging.current, point);
          }}
          onPointerUp={(event) => {
            dragging.current = null;
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            window.setTimeout(() => {
              suppressNextClick.current = false;
            }, 0);
          }}
          onPointerCancel={() => {
            dragging.current = null;
            suppressNextClick.current = false;
          }}
        >
          <rect className="editor-path-bg" width={props.spec.gridCols} height={props.spec.gridRows} />
          {Array.from({ length: props.spec.gridCols + 1 }, (_, x) => (
            <line key={`x-${x}`} className="editor-path-grid" x1={x} y1={0} x2={x} y2={props.spec.gridRows} />
          ))}
          {Array.from({ length: props.spec.gridRows + 1 }, (_, y) => (
            <line key={`y-${y}`} className="editor-path-grid" x1={0} y1={y} x2={props.spec.gridCols} y2={y} />
          ))}
          {drawPoints.length > 1 ? (
            <polyline
              className="editor-path-line"
              points={drawPoints.map((point) => `${point.x + 0.5},${point.y + 0.5}`).join(' ')}
            />
          ) : null}
          {props.item.points.map((point, index) => (
            <g
              key={index}
              className="editor-path-point"
              data-point-index={index}
              onPointerDown={(event) => {
                event.preventDefault();
                dragging.current = index;
                suppressNextClick.current = true;
                event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
                moveCursor(point);
              }}
            >
              <circle
                className="editor-path-point-hit"
                cx={point.x + 0.5}
                cy={point.y + 0.5}
                r={0.6}
              />
              <circle
                className="editor-path-point-dot"
                cx={point.x + 0.5}
                cy={point.y + 0.5}
                r={0.22}
              />
            </g>
          ))}
          <path
            className="editor-path-cursor"
            d={`M ${cursor.x + 0.24} ${cursor.y + 0.5} H ${cursor.x + 0.76} M ${cursor.x + 0.5} ${cursor.y + 0.24} V ${cursor.y + 0.76}`}
          />
        </svg>
      </div>
      <p id={instructionsId} className="editor-path-help">{props.instructions}</p>
    </div>
  );
}
