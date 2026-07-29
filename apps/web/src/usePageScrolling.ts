/**
 * True while the page is being scrolled, then false shortly after it settles.
 *
 * Used by the header mark so he can pull a phone and mime scrolling along with
 * the visitor. Opted out under `prefers-reduced-motion` — the gag is motion.
 */

import { useEffect, useRef, useState } from 'react';

export type UsePageScrollingOptions = {
  /** How long after the last scroll event before we call it settled. */
  settleMs?: number;
  /** Ignore sub-pixel / trackpad noise below this many CSS pixels. */
  thresholdPx?: number;
};

const DEFAULT_SETTLE_MS = 480;
const DEFAULT_THRESHOLD_PX = 2;

export function usePageScrolling(options: UsePageScrollingOptions = {}): boolean {
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const thresholdPx = options.thresholdPx ?? DEFAULT_THRESHOLD_PX;
  const [scrolling, setScrolling] = useState(false);
  const lastY = useRef<number | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let reduceMotion = false;
    let media: MediaQueryList | null = null;
    const syncReduce = () => {
      reduceMotion = media?.matches ?? false;
      if (reduceMotion && scrollingRef.current) {
        scrollingRef.current = false;
        setScrolling(false);
      }
    };
    if (typeof matchMedia === 'function') {
      media = matchMedia('(prefers-reduced-motion: reduce)');
      syncReduce();
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', syncReduce);
      } else {
        media.addListener(syncReduce);
      }
    }

    const clearSettle = () => {
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
    };

    const markScrolling = () => {
      if (reduceMotion) return;
      if (!scrollingRef.current) {
        scrollingRef.current = true;
        setScrolling(true);
      }
      clearSettle();
      settleTimer.current = setTimeout(() => {
        scrollingRef.current = false;
        setScrolling(false);
        settleTimer.current = null;
      }, settleMs);
    };

    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const prev = lastY.current;
      lastY.current = y;
      if (prev == null) return;
      if (Math.abs(y - prev) < thresholdPx) return;
      markScrolling();
    };

    lastY.current = window.scrollY || document.documentElement.scrollTop || 0;
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      clearSettle();
      if (media) {
        if (typeof media.removeEventListener === 'function') {
          media.removeEventListener('change', syncReduce);
        } else {
          media.removeListener(syncReduce);
        }
      }
    };
  }, [settleMs, thresholdPx]);

  return scrolling;
}
