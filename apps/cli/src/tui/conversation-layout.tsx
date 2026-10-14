import { useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Box, Static, Text, measureElement, type DOMElement } from 'ink';
import { TranscriptLine } from './transcript.js';
import { elementRect, useTerminalInput, wheelInside } from './mouse.js';
import { transcriptRows, transcriptWindow } from './transcript-window.js';
import type { Regions } from './selection.js';

function TranscriptViewport({
  lines,
  offset,
  color,
  blocked,
  layout,
  regions,
}: {
  lines: string[];
  offset: number;
  color: boolean;
  blocked: boolean;
  layout: ReactNode;
  regions?: MutableRefObject<Regions>;
}) {
  const viewport = useRef<DOMElement>(null);
  const panel = useRef<DOMElement>(null);
  const content = useRef<DOMElement>(null);
  const rowNodes = useRef(new Map<number, DOMElement>());
  const [size, setSize] = useState({ height: 0, width: 0 });
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const geometry = useMemo(() => transcriptRows(lines, offset, heights), [lines, offset, heights]);
  const [scroll, setScroll] = useState<number | null>(null);
  const anchor = useRef<{ index: number; within: number } | null>(null);
  useLayoutEffect(() => {
    if (!viewport.current || !content.current) return;
    const { height, width } = measureElement(viewport.current);
    if (width !== size.width) {
      if (scroll !== null) {
        const currentMax = Math.max(0, geometry.total - size.height);
        const currentStart = Math.min(scroll, currentMax);
        const row = geometry.rows.find((r) => r.top + (r.height ?? 1) > currentStart);
        if (row) {
          anchor.current = { index: row.index, within: Math.max(0, currentStart - row.top) };
        }
      }
      setSize({ height, width });
      setHeights(new Map());
      return;
    }
    setSize((previous) => (previous.height === height ? previous : { height, width }));
    let measured: Map<string, number> | undefined;
    for (const [index, node] of rowNodes.current) {
      const row = geometry.rows[index - offset];
      if (!row || heights.has(row.key)) continue;
      const value = measureElement(node).height;
      (measured ??= new Map(heights)).set(row.key, value);
    }
    if (measured) setHeights(measured);
    if (anchor.current && heights.size > 0) {
      const row = geometry.rows.find((r) => r.index === anchor.current!.index);
      if (row) {
        const nextMax = Math.max(0, geometry.total - height);
        const nextStart = Math.min(nextMax, Math.max(0, row.top + anchor.current.within));
        anchor.current = null;
        setScroll(nextStart >= nextMax ? null : nextStart);
      }
    }
  }, [geometry, heights, layout, scroll, size, offset]);
  const pendingDelta = useRef(0);
  const scheduled = useRef(false);
  const max = Math.max(0, geometry.total - size.height);
  const start = scroll === null ? max : Math.min(scroll, max);
  const distance = max - start;
  const page = Math.max(1, size.height + Number(distance > 0) - 1);
  useTerminalInput(
    (_input, key) => {
      if (blocked) return;
      if (key.pageUp) setScroll(Math.max(0, start - page));
      if (key.pageDown) setScroll(start + page >= max ? null : start + page);
    },
    (wheel) => {
      if (!wheelInside(panel.current, wheel)) return;
      pendingDelta.current += wheel.direction * 3;
      if (!scheduled.current) {
        scheduled.current = true;
        queueMicrotask(() => {
          scheduled.current = false;
          const delta = pendingDelta.current;
          pendingDelta.current = 0;
          if (delta === 0) return;
          setScroll((value) => {
            const current = value === null ? max : Math.min(value, max);
            const next = Math.max(0, Math.min(max, current + delta));
            return next >= max ? null : next;
          });
        });
      }
    },
  );
  useLayoutEffect(() => {
    if (!regions) return;
    const current = regions.current;
    return () => {
      current.chat = null;
    };
  }, [regions]);
  if (regions) {
    regions.current.chat = {
      rect: () => elementRect(viewport.current),
      at: (y) => {
        const rect = elementRect(viewport.current);
        if (!rect) return null;
        const target = start + y - rect.top;
        const row = geometry.rows.find((r) => r.height !== undefined && target >= r.top && target < r.top + r.height);
        return row ? [row.index, target - row.top] : null;
      },
      scroll: (delta) =>
        setScroll((value) => {
          const next = Math.max(0, Math.min(max, (value === null ? max : Math.min(value, max)) + delta));
          return next >= max ? null : next;
        }),
    };
  }
  const messages = useMemo(
    () =>
      transcriptWindow(geometry.rows, start, size.height).map((segment) =>
        segment.height !== undefined ? (
          <Box key={`space:${segment.index}`} height={segment.height} flexShrink={0} />
        ) : (
          <Box
            key={segment.index}
            flexDirection="column"
            flexShrink={0}
            ref={(node) => {
              if (node) rowNodes.current.set(segment.index, node);
              else rowNodes.current.delete(segment.index);
            }}
          >
            <TranscriptLine line={lines[segment.index]!} previous={lines[segment.index - 1]} color={color} />
          </Box>
        ),
      ),
    [geometry, start, size.height, lines, color],
  );
  return (
    <Box ref={panel} flexGrow={1} flexBasis={0} minHeight={0} flexDirection="column">
      {distance > 0 && <Text dimColor>Earlier messages · PgDn to return to latest</Text>}
      <Box ref={viewport} flexGrow={1} flexBasis={0} overflow="hidden" flexDirection="column">
        <Box ref={content} flexShrink={0} flexDirection="column" marginTop={-start}>
          {messages}
        </Box>
      </Box>
    </Box>
  );
}

export function ConversationLayout({
  lines,
  offset,
  color,
  split,
  width,
  rows,
  blocked,
  hidden,
  panel,
  children,
  hold = false,
  regions,
}: {
  lines: string[];
  offset: number;
  color: boolean;
  split: boolean;
  width: number;
  rows: number;
  blocked: boolean;
  hidden: boolean;
  panel?: ReactNode;
  children: ReactNode;
  hold?: boolean;
  regions?: MutableRefObject<Regions>;
}) {
  // Keep Ink's static node mounted while split output waits for scrollback.
  const printed = useRef(offset);
  if (!split && !hold) printed.current = lines.length;
  return (
    <Box width={width} height={split ? rows : undefined} flexDirection={split ? 'row' : 'column'}>
      <Static items={lines.slice(offset, printed.current)} style={{ width }}>
        {(line, index) => <TranscriptLine key={index} line={line} previous={lines[offset + index - 1]} color={color} />}
      </Static>
      <Box
        ref={(node) => {
          if (regions) regions.current.column = node;
        }}
        flexGrow={1}
        minWidth={0}
        flexDirection="column"
      >
        {split && !hidden && (
          <TranscriptViewport
            lines={lines}
            offset={offset}
            color={color}
            blocked={blocked}
            layout={children}
            regions={regions}
          />
        )}
        <Box flexDirection="column" flexShrink={0}>
          {children}
        </Box>
      </Box>
      {split && panel && (
        <Box
          ref={(node) => {
            if (regions) regions.current.panel = node;
          }}
          flexShrink={0}
        >
          {panel}
        </Box>
      )}
    </Box>
  );
}
