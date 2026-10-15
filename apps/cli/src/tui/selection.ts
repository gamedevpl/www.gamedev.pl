import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useStdout, type DOMElement } from 'ink';
import { elementRect, inside, type Pointer, type Rect } from './mouse.js';
import { columnText, frameOf, highlight, repaint, wordAt, type Frame } from './screen-grid.js';

// Chat lines are [message, wrapped row]; other regions use [screen row, 0].
export type Line = readonly [number, number];
export type ChatLocator = {
  rect: () => Rect | null;
  at: (y: number) => Line | null;
  scroll: (delta: number) => void;
};
export type Regions = { chat: ChatLocator | null; column: DOMElement | null; panel: DOMElement | null };
export type Clipboard = (text: string, write: (data: string) => void) => boolean;
type Kind = 'chat' | 'column' | 'panel';
type Spot = { line: Line; col: number };
type Selection = { kind: Kind; anchor: Spot; head: Spot; dragged: boolean; clicks: number };
type Region = {
  rect: Rect;
  at: (y: number) => Line | null;
  text: (line: Line) => string | undefined;
  lines: (from: Line, to: Line) => Line[];
  scroll?: (delta: number) => void;
};

const BORDER_START = /^[\u2500-\u257f]+ */;
const BORDER_END = / *[\u2500-\u257f]+$/;
const compare = (a: Line, b: Line) => a[0] - b[0] || a[1] - b[1];
const same = (a: Line, b: Line) => compare(a, b) === 0;
const right = (rect: Rect) => rect.left + rect.width - 1;
const bottom = (rect: Rect) => rect.top + rect.height - 1;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const ordered = (selection: Selection): [Spot, Spot] => {
  const { anchor, head } = selection;
  const order = compare(anchor.line, head.line) || anchor.col - head.col;
  return order <= 0 ? [anchor, head] : [head, anchor];
};

export function useSelection({
  enabled,
  rows,
  regions,
  clipboard,
  color = true,
}: {
  enabled: boolean;
  rows: number;
  regions: MutableRefObject<Regions>;
  clipboard: Clipboard;
  color?: boolean;
}) {
  const { stdout } = useStdout();
  const [notice, setNotice] = useState('');
  const frame = useRef<Frame | null>(null);
  const chatRows = useRef(new Map<string, { line: Line; text: string }>());
  const selection = useRef<Selection | null>(null);
  const painted = useRef(new Map<number, string>());
  const lastPress = useRef({ kind: '', x: 0, y: 0, at: 0, clicks: 0 });
  const edge = useRef<{ timer: ReturnType<typeof setInterval>; direction: number } | undefined>(undefined);
  const write = useRef<(data: string) => void>(() => {});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const region = (kind: Kind): Region | null => {
    if (kind === 'chat') {
      const chat = regions.current.chat;
      const rect = chat?.rect();
      if (!chat || !rect) return null;
      return {
        rect,
        at: chat.at,
        scroll: chat.scroll,
        text: (line) => chatRows.current.get(line.join(':'))?.text,
        lines: (from, to) =>
          [...chatRows.current.values()]
            .map((row) => row.line)
            .filter((line) => compare(line, from) >= 0 && compare(line, to) <= 0)
            .sort(compare),
      };
    }
    const rect = elementRect(regions.current[kind]);
    if (!rect) return null;
    return {
      rect,
      at: (y) => (y >= rect.top && y <= bottom(rect) ? [y, 0] : null),
      text: ([y]) => columnText(frame.current?.plain[y - 1] ?? '', rect.left, right(rect)),
      lines: (from, to) => Array.from({ length: to[0] - from[0] + 1 }, (_, index) => [from[0] + index, 0] as const),
    };
  };

  const overlay = (): string => {
    const screen = frame.current;
    if (!screen) return '';
    const next = new Map<number, string>();
    const current = selection.current;
    const area = current && region(current.kind);
    if (current && area && (current.dragged || current.clicks > 1)) {
      const [start, end] = ordered(current);
      for (let y = area.rect.top; y <= bottom(area.rect); y++) {
        const line = area.at(y);
        if (!line || compare(line, start.line) < 0 || compare(line, end.line) > 0) continue;
        const from = same(line, start.line) ? start.col : area.rect.left;
        const to = same(line, end.line) ? end.col : right(area.rect);
        if (from <= to) next.set(y, highlight(screen, y, from, to, color));
      }
    }
    let output = '';
    for (const [y, drawn] of painted.current) if (next.get(y) !== drawn) output += repaint(screen, y);
    for (const drawn of next.values()) output += drawn;
    painted.current = next;
    return output && `\u001b7${output}\u001b8`;
  };
  const paint = () => {
    const output = overlay();
    if (output) write.current(output);
  };

  const remember = (screen: Frame) => {
    const chat = regions.current.chat;
    const rect = chat?.rect();
    if (!chat || !rect) return;
    for (let y = rect.top; y <= bottom(rect); y++) {
      const line = chat.at(y);
      if (line)
        chatRows.current.set(line.join(':'), {
          line,
          text: columnText(screen.plain[y - 1] ?? '', rect.left, right(rect)),
        });
    }
  };

  const stopEdge = () => {
    clearInterval(edge.current?.timer);
    edge.current = undefined;
  };

  useEffect(() => {
    if (!enabled) return;
    const original = stdout.write;
    write.current = (data) => void original.call(stdout, data);
    const tapped = function (this: unknown, chunk: unknown, ...rest: unknown[]) {
      const screen = frameOf(String(chunk), rowsRef.current);
      if (screen) {
        frame.current = screen;
        remember(screen);
        painted.current.clear();
        // One write keeps the highlight from flickering under redraws.
        chunk = String(chunk) + overlay();
      }
      return (original as (...args: unknown[]) => boolean).call(stdout, chunk, ...rest);
    } as typeof stdout.write;
    stdout.write = tapped;
    return () => {
      if (stdout.write === tapped) stdout.write = original;
      stopEdge();
      write.current = () => {};
      frame.current = null;
      selection.current = null;
      painted.current.clear();
      chatRows.current.clear();
    };
  }, [enabled, stdout]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  const selectedText = (current: Selection): string => {
    const area = region(current.kind);
    if (!area) return '';
    const [start, end] = ordered(current);
    return area
      .lines(start.line, end.line)
      .map((line) => {
        const from = same(line, start.line) ? start.col - area.rect.left + 1 : 1;
        const to = same(line, end.line) ? end.col - area.rect.left + 1 : area.rect.width;
        return columnText(area.text(line) ?? '', from, to)
          .replace(BORDER_START, '')
          .replace(BORDER_END, '')
          .trimEnd();
      })
      .join('\n');
  };

  const copy = (current: Selection) => {
    const text = selectedText(current);
    if (!text) return;
    const copied = clipboard(text, write.current);
    setNotice(copied ? `Copied ${[...text].length} characters` : 'Selection too large to copy');
  };

  const extend = (current: Selection, x: number, y: number) => {
    const area = region(current.kind);
    if (!area) return;
    const { rect } = area;
    const line = area.at(clamp(y, rect.top, bottom(rect)));
    if (line) current.head = { line, col: clamp(x, rect.left, right(rect)) };
    current.dragged = true;
    // The first terminal row has nothing above it, so it scrolls up.
    const direction = y < rect.top || y === 1 ? -1 : y > bottom(rect) ? 1 : 0;
    if (!direction || !area.scroll) return stopEdge();
    if (edge.current?.direction === direction) return;
    stopEdge();
    // Reveal one row per step so every copied row gets drawn.
    const step = () => {
      const live = selection.current && region(current.kind);
      if (!live?.scroll || selection.current !== current) return stopEdge();
      const next = live.at(direction < 0 ? live.rect.top - 1 : bottom(live.rect) + 1);
      if (!next) return;
      current.head = { line: next, col: direction < 0 ? live.rect.left : right(live.rect) };
      live.scroll(direction);
    };
    step();
    edge.current = { timer: setInterval(step, 60), direction };
  };

  const onPointer = (pointer: Pointer) => {
    if (!enabled || !frame.current) return;
    const current = selection.current;
    if (pointer.kind === 'drag') {
      lastPress.current.at = 0;
      if (current) {
        extend(current, pointer.x, pointer.y);
        paint();
      }
      return;
    }
    if (pointer.kind === 'release') {
      stopEdge();
      if (!current) return;
      if (current.dragged || current.clicks > 1) copy(current);
      else selection.current = null;
      paint();
      return;
    }
    const kind = (['chat', 'panel', 'column'] as const).find((name) =>
      inside(
        name === 'chat' ? (regions.current.chat?.rect() ?? null) : elementRect(regions.current[name]),
        pointer.x,
        pointer.y,
      ),
    );
    const area = kind && region(kind);
    const line = area?.at(pointer.y);
    if (!kind || !area || !line) {
      selection.current = null;
      paint();
      return;
    }
    const previous = lastPress.current;
    const repeated = previous.kind === kind && previous.x === pointer.x && previous.y === pointer.y;
    const clicks = repeated && Date.now() - previous.at < 400 ? previous.clicks + 1 : 1;
    lastPress.current = { kind, x: pointer.x, y: pointer.y, at: Date.now(), clicks };
    if (clicks === 1) {
      chatRows.current.clear();
      remember(frame.current);
    }
    let from = pointer.x;
    let to = pointer.x;
    if (clicks === 2) {
      const word = wordAt(area.text(line) ?? '', pointer.x - area.rect.left + 1);
      if (word) [from, to] = [word[0] + area.rect.left - 1, word[1] + area.rect.left - 1];
    } else if (clicks > 2) [from, to] = [area.rect.left, right(area.rect)];
    selection.current = { kind, anchor: { line, col: from }, head: { line, col: to }, dragged: false, clicks };
    paint();
  };

  const clear = (): boolean => {
    if (!selection.current) return false;
    stopEdge();
    selection.current = null;
    paint();
    return true;
  };

  return { onPointer, clear, notice };
}
