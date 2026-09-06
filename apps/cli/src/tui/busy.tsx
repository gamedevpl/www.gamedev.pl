import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function BusyPanel({ activity, since, color }: { activity: string; since: number; color: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 100);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const duration = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color={color ? 'cyan' : undefined}>{color ? FRAMES[tick % FRAMES.length] : '|/-\\'[tick % 4]} </Text>
        <Box flexGrow={1} flexShrink={1}>
          <Text bold wrap="truncate-end">
            {activity}
          </Text>
        </Box>
        <Text dimColor> {duration}</Text>
      </Box>
      <Text dimColor wrap="truncate-end">
        {elapsed >= 15 ? 'Still working — Ctrl+C to stop / exit' : 'Ctrl+C to stop / exit'}
      </Text>
    </Box>
  );
}
