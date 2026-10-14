import { useRef, useState } from 'react';
import { Box, Text, type DOMElement } from 'ink';
import wrapAnsi from 'wrap-ansi';
import type { SessionDiff } from '../session-diff.js';
import { checkoutLineStyle } from '../checkout-style.js';
import { useTerminalInput, wheelInside } from './mouse.js';

export function DiffViewer({
  diff,
  rows,
  columns,
  color,
  close,
}: {
  diff: SessionDiff;
  rows: number;
  columns: number;
  color: boolean;
  close: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const panel = useRef<DOMElement>(null);
  const count = Math.max(1, rows - 4);
  const width = Math.max(1, columns - 2);
  const lines = diff.lines.flatMap((line) =>
    wrapAnsi(line || ' ', width, { hard: true, trim: false })
      .split('\n')
      .map((text) => ({ text, style: checkoutLineStyle(line) })),
  );
  const max = Math.max(0, lines.length - count);
  const start = Math.min(offset, max);
  useTerminalInput(
    (input, key) => {
      if (key.escape || input === 'q' || (key.ctrl && (input === 'd' || input === 'c'))) close();
      else if (key.upArrow || input === 'k') setOffset(Math.max(0, start - 1));
      else if (key.downArrow || input === 'j') setOffset(Math.min(max, start + 1));
      else if (key.pageUp) setOffset(Math.max(0, start - count));
      else if (key.pageDown || input === ' ') setOffset(Math.min(max, start + count));
      else if (input === 'g') setOffset(0);
      else if (input === 'G') setOffset(max);
    },
    (wheel) => {
      if (wheelInside(panel.current, wheel)) {
        setOffset((value) => Math.max(0, Math.min(max, value + wheel.direction * 3)));
      }
    },
  );
  return (
    <Box ref={panel} flexDirection="column" borderStyle="round" height={Math.max(5, rows)}>
      <Text bold>
        Diff · platform → local · {diff.files.length} {diff.files.length === 1 ? 'file' : 'files'}
      </Text>
      <Box flexDirection="column" height={count}>
        {lines.slice(start, start + count).map((line, index) => (
          <Text key={index} color={color ? line.style?.tone : undefined} bold={line.style?.bold} wrap="truncate-end">
            {line.text}
          </Text>
        ))}
      </Box>
      <Text dimColor wrap="truncate-end">
        {`↑↓ / PgUp/PgDn · ${start + 1}–${Math.min(lines.length, start + count)}/${lines.length} · q / Esc close`}
      </Text>
    </Box>
  );
}
