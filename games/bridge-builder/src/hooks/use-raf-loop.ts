import { useEffect, useRef } from 'react';

/**
 * Custom hook for requestAnimationFrame loop
 */
export function useRafLoop(enabled: boolean, callback: (dt: number) => void): void {
  const rafRef = useRef<number>(0);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      cbRef.current(dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);
}
