import { useLayoutEffect, useRef, useState } from 'react';
import { useStdout } from 'ink';

export const ALT_ON = '\u001b[?1049h\u001b[H\u001b[2J';
export const ALT_OFF = '\u001b[?1049l';
export const ALT_CLEAR = '\u001b[H\u001b[2J';

// Switch buffers between frames, so scrollback never receives workspace frames.
export function useAltScreen(enabled: boolean): boolean {
  const { stdout, write } = useStdout();
  const [active, setActive] = useState(false);
  const current = useRef(false);
  useLayoutEffect(() => {
    if (enabled === active || (enabled && !stdout.isTTY)) return;
    // Ink erases its frame, switches, then redraws on the new buffer.
    write(enabled ? ALT_ON : ALT_OFF);
    current.current = enabled;
    setActive(enabled);
  }, [enabled, active, stdout, write]);
  // Layout cleanup runs before a terminal handoff writes to the main buffer.
  useLayoutEffect(() => {
    const release = () => {
      if (current.current && !stdout.writableEnded && !stdout.destroyed) stdout.write(ALT_OFF);
      current.current = false;
    };
    process.once('exit', release);
    return () => {
      process.off('exit', release);
      release();
    };
  }, [stdout]);
  return active;
}
