import { useCallback, useEffect, useRef, useState } from 'react';

// Same fade idea as GameTheater's chrome bar.
const PLAY_CHROME_IDLE_MS = 3200;

export type PlayChromeIdle = { idle: boolean; noteActivity: () => void };

// True once `active` idles with no tap, key, or relayed iframe input.
export function usePlayChromeIdle(active: boolean): PlayChromeIdle {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const noteActivity = useCallback(() => {
    if (!activeRef.current) return;
    setIdle(false);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setIdle(true), PLAY_CHROME_IDLE_MS);
  }, []);

  useEffect(() => {
    if (!active) {
      setIdle(false);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      return;
    }
    noteActivity();
    window.addEventListener('pointerdown', noteActivity);
    window.addEventListener('keydown', noteActivity);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      window.removeEventListener('pointerdown', noteActivity);
      window.removeEventListener('keydown', noteActivity);
    };
  }, [active, noteActivity]);

  return { idle, noteActivity };
}
