import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Static, Text, measureElement, useStdout, type DOMElement } from 'ink';
import { TranscriptLine } from './transcript.js';
import { useTerminalInput, wheelInside } from './mouse.js';
import { transcriptRows, transcriptWindow } from './transcript-window.js';

function TranscriptViewport({
  lines,
  offset,
  color,
  blocked,
  layout,
  paused,
}: {
  lines: string[];
  offset: number;
  color: boolean;
  blocked: boolean;
  layout: ReactNode;
  paused: boolean;
}) {
  const viewport = useRef<DOMElement>(null);
  const panel = useRef<DOMElement>(null);
  const content = useRef<DOMElement>(null);
  const rowNodes = useRef(new Map<number, DOMElement>());
  const [size, setSize] = useState({ height: 0, width: 0 });
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const geometry = useMemo(() => transcriptRows(lines, offset, heights), [lines, offset, heights]);
  const [scroll, setScroll] = useState<number | null>(null);
  const { stdout } = useStdout();
  useLayoutEffect(() => {
    if (!viewport.current || !content.current) return;
    const { height, width } = measureElement(viewport.current);
    if (width !== size.width) {
      setSize({ height, width });
      setHeights(new Map());
      return;
    }
    setSize((previous) => (previous.height === height ? previous : { height, width }));
    let measured: Map<string, number> | undefined;
    for (const [index, node] of rowNodes.current) {
      const row = geometry.rows[index - offset];
      if (!row) continue;
      const value = measureElement(node).height;
      if (heights.get(row.key) !== value) (measured ??= new Map(heights)).set(row.key, value);
    }
    if (measured) setHeights(measured);
  }, [geometry, heights, layout, scroll, size, offset]);
  const max = Math.max(0, geometry.total - size.height);
  const start = scroll === null ? max : Math.min(scroll, max);
  const distance = max - start;
  const page = Math.max(1, size.height + Number(distance > 0) - 1);
  useTerminalInput(
    (_input, key) => {
      if (blocked || paused) return;
      if (key.pageUp) setScroll(Math.max(0, start - page));
      if (key.pageDown) setScroll(start + page >= max ? null : start + page);
    },
    (wheel) => {
      if (paused || !wheelInside(panel.current, wheel, stdout.rows || 24)) return;
      setScroll((value) => {
        const next = Math.max(0, Math.min(max, (value === null ? max : Math.min(value, max)) + wheel.direction * 3));
        return next >= max ? null : next;
      });
    },
  );
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
  paused = false,
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
  paused?: boolean;
}) {
  // Keep Ink's static node mounted while split output waits for scrollback.
  const printed = useRef(offset);
  if (!split) printed.current = lines.length;
  return (
    <Box width={width} height={split ? rows : undefined} flexDirection={split ? 'row' : 'column'}>
      <Static items={lines.slice(offset, printed.current)} style={{ width }}>
        {(line, index) => <TranscriptLine key={index} line={line} previous={lines[offset + index - 1]} color={color} />}
      </Static>
      <Box flexGrow={1} minWidth={0} flexDirection="column">
        {split && !hidden && (
          <TranscriptViewport
            lines={lines}
            offset={offset}
            color={color}
            blocked={blocked}
            paused={paused}
            layout={children}
          />
        )}
        <Box flexDirection="column" flexShrink={0}>
          {children}
        </Box>
      </Box>
      {split && panel}
    </Box>
  );
}
