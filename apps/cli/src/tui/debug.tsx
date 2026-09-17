import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
export function TaskDebug({ read, rows, close }: { read: () => string[]; rows: number; close: () => void }) {
  const [lines, setLines] = useState(read);
  const [offset, setOffset] = useState(0);
  const count = Math.max(1, rows - 4);
  useEffect(() => {
    if (offset) return;
    const timer = setInterval(() => setLines(read()), 500);
    return () => clearInterval(timer);
  }, [read, offset]);
  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'l')) close();
    else if (key.upArrow) setOffset((value) => Math.min(Math.max(0, lines.length - count), value + 1));
    else if (key.downArrow) setOffset((value) => Math.max(0, value - 1));
  });
  const end = Math.max(0, lines.length - offset);
  return (
    <Box flexDirection="column" borderStyle="round">
      <Text bold>Task diagnostics · {offset ? 'paused' : 'live'}</Text>
      {lines.slice(Math.max(0, end - count), end).map((line, index) => (
        <Text key={index} wrap="truncate-end">
          {line}
        </Text>
      ))}
      <Text dimColor>↑↓ scroll · Esc / Ctrl+L close · Ctrl+C stops task</Text>
    </Box>
  );
}
