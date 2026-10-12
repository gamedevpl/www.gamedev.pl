import { useEffect, useRef, useState } from 'react';
import { Box, Text, useStdout, type DOMElement } from 'ink';
import { useTerminalInput, wheelInside } from './mouse.js';
export function TaskDebug({
  read,
  rows,
  close,
  paused = false,
}: {
  read: () => string[];
  rows: number;
  close: () => void;
  paused?: boolean;
}) {
  const [lines, setLines] = useState(read);
  const [offset, setOffset] = useState(0);
  const panel = useRef<DOMElement>(null);
  const { stdout } = useStdout();
  const count = Math.max(1, rows - 4);
  useEffect(() => {
    if (offset || paused) return;
    const timer = setInterval(() => setLines(read()), 500);
    return () => clearInterval(timer);
  }, [read, offset, paused]);
  useTerminalInput(
    (input, key) => {
      if (paused) return;
      if (key.escape || (key.ctrl && input === 'l')) close();
      else if (key.upArrow) setOffset((value) => Math.min(Math.max(0, lines.length - count), value + 1));
      else if (key.downArrow) setOffset((value) => Math.max(0, value - 1));
    },
    (wheel) => {
      if (!paused && wheelInside(panel.current, wheel, stdout.rows || 24)) {
        setOffset((value) => Math.max(0, Math.min(Math.max(0, lines.length - count), value - wheel.direction * 3)));
      }
    },
  );
  const end = Math.max(0, lines.length - offset);
  return (
    <Box ref={panel} flexDirection="column" borderStyle="round">
      <Text bold>Task diagnostics · {paused ? 'Text selection · Ctrl+T resume' : offset ? 'paused' : 'live'}</Text>
      {lines.slice(Math.max(0, end - count), end).map((line, index) => (
        <Text key={index} wrap="truncate-end">
          {line}
        </Text>
      ))}
      <Text dimColor>
        {paused
          ? 'Display paused; task continues · Ctrl+C stops task'
          : '↑↓ scroll · Esc / Ctrl+L close · Ctrl+C stops task'}
      </Text>
    </Box>
  );
}
