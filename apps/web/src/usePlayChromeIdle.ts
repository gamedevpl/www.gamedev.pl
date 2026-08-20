import { useEffect, useState } from 'react';

// Same fade idea as GameTheater's chrome bar.
const PLAY_CHROME_IDLE_MS = 3200;

// True once `active` idles a few seconds with no tap or key.
export function usePlayChromeIdle(active: boolean): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!active) {
      setIdle(false);
      return;
    }
    let timer: number | null = null;
    const resetIdle = () => {
      setIdle(false);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), PLAY_CHROME_IDLE_MS);
    };
    resetIdle();
    window.addEventListener('pointerdown', resetIdle);
    window.addEventListener('keydown', resetIdle);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('pointerdown', resetIdle);
      window.removeEventListener('keydown', resetIdle);
    };
  }, [active]);

  return idle;
}
