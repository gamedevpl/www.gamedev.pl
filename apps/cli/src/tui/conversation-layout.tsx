import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Static, Text, measureElement, useInput, type DOMElement } from 'ink';
import { TranscriptLine } from './transcript.js';

function TranscriptViewport({
  lines,
  offset,
  color,
  blocked,
  layout,
}: {
  lines: string[];
  offset: number;
  color: boolean;
  blocked: boolean;
  layout: ReactNode;
}) {
  const viewport = useRef<DOMElement>(null);
  const content = useRef<DOMElement>(null);
  const [size, setSize] = useState({ height: 0, total: 0 });
  const [scroll, setScroll] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!viewport.current || !content.current) return;
    const height = measureElement(viewport.current).height;
    const total = measureElement(content.current).height;
    setSize((previous) => (previous.height === height && previous.total === total ? previous : { height, total }));
  }, [lines, offset, layout, scroll, size]);
  const max = Math.max(0, size.total - size.height);
  const start = scroll === null ? max : Math.min(scroll, max);
  const distance = max - start;
  const page = Math.max(1, size.height + Number(distance > 0) - 1);
  useInput((_input, key) => {
    if (blocked) return;
    if (key.pageUp) setScroll(Math.max(0, start - page));
    if (key.pageDown) setScroll(start + page >= max ? null : start + page);
  });
  return (
    <Box flexGrow={1} flexBasis={0} minHeight={0} flexDirection="column">
      {distance > 0 && <Text dimColor>Earlier messages · PgDn to return to latest</Text>}
      <Box ref={viewport} flexGrow={1} flexBasis={0} overflow="hidden" flexDirection="column">
        <Box ref={content} flexShrink={0} flexDirection="column" marginTop={-start}>
          {lines.slice(offset).map((line, index) => (
            <TranscriptLine key={offset + index} line={line} previous={lines[offset + index - 1]} color={color} />
          ))}
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
  panel,
  children,
}: {
  lines: string[];
  offset: number;
  color: boolean;
  split: boolean;
  width: number;
  rows: number;
  blocked: boolean;
  panel?: ReactNode;
  children: ReactNode;
}) {
  const printed = useRef(offset);
  if (split) printed.current = lines.length;
  return (
    <Box width={width} height={split ? rows : undefined} flexDirection={split ? 'row' : 'column'}>
      {!split && (
        <Static items={lines.slice(printed.current)} style={{ width }}>
          {(line, index) => (
            <TranscriptLine key={index} line={line} previous={lines[printed.current + index - 1]} color={color} />
          )}
        </Static>
      )}
      <Box flexGrow={1} minWidth={0} flexDirection="column">
        {split && !blocked && (
          <TranscriptViewport lines={lines} offset={offset} color={color} blocked={blocked} layout={children} />
        )}
        <Box flexDirection="column" flexShrink={0}>
          {children}
        </Box>
      </Box>
      {split && panel}
    </Box>
  );
}
