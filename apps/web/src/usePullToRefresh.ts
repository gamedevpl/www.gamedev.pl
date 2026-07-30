/**
 * Pull-down-to-refresh for the installed PWA (and browser tabs that lack a native
 * gesture). Standalone display mode does not get the browser chrome's pull-to-refresh,
 * so a phone or desktop trackpad overscroll at the top of the page would otherwise do
 * nothing. This restores that habit without fighting gameplay — callers disable it
 * while `body.player-open` (see styles.css) so a downward swipe stays a game input.
 *
 * Touch and pointer cover phones and mouse drags; wheel covers desktop trackpads.
 * The page must already be scrolled to the top before a pull starts counting.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type PullToRefreshStatus = 'idle' | 'pulling' | 'ready' | 'refreshing';

export type UsePullToRefreshOptions = {
  /** When false, listeners stay quiet and any in-flight pull resets. */
  enabled?: boolean;
  /** Called once the pull crosses the threshold and the finger/wheel releases. */
  onRefresh: () => void | Promise<void>;
  /** How far (CSS px) the pull must travel before release triggers a refresh. */
  thresholdPx?: number;
  /** Cap on the rubber-band distance shown while pulling. */
  maxPullPx?: number;
  /** Wheel delta (px) that counts as one full threshold pull at the top. */
  wheelThresholdPx?: number;
};

export type UsePullToRefreshResult = {
  status: PullToRefreshStatus;
  /** Visual pull distance, damped so it feels rubbery rather than 1:1 with the finger. */
  pullDistance: number;
};

const DEFAULT_THRESHOLD_PX = 72;
const DEFAULT_MAX_PULL_PX = 120;
const DEFAULT_WHEEL_THRESHOLD_PX = 120;
/** Near-zero scroll counts as "at top" — sub-pixel / rubber-band noise. */
const AT_TOP_PX = 2;
/** Ignore tiny touch jitter before treating a move as a pull. */
const ARM_SLOP_PX = 8;

function scrollTop(): number {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function isPlayerOpen(): boolean {
  return document.body.classList.contains('player-open');
}

/** Rubber-band: maps raw finger travel into a softer visual distance. */
export function dampPull(rawPx: number, maxPullPx: number): number {
  if (rawPx <= 0) return 0;
  const capped = Math.min(rawPx, maxPullPx * 2);
  return maxPullPx * (1 - Math.exp(-capped / maxPullPx));
}

export function usePullToRefresh(options: UsePullToRefreshOptions): UsePullToRefreshResult {
  const {
    enabled = true,
    onRefresh,
    thresholdPx = DEFAULT_THRESHOLD_PX,
    maxPullPx = DEFAULT_MAX_PULL_PX,
    wheelThresholdPx = DEFAULT_WHEEL_THRESHOLD_PX,
  } = options;

  const [status, setStatus] = useState<PullToRefreshStatus>('idle');
  const [pullDistance, setPullDistance] = useState(0);

  const statusRef = useRef<PullToRefreshStatus>('idle');
  const pullRawRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const trackingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const wheelAccRef = useRef(0);
  const wheelResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setStatusBoth = useCallback((next: PullToRefreshStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const resetPull = useCallback(() => {
    pullRawRef.current = 0;
    startYRef.current = null;
    trackingRef.current = false;
    pointerIdRef.current = null;
    setPullDistance(0);
    if (statusRef.current !== 'refreshing') {
      setStatusBoth('idle');
    }
  }, [setStatusBoth]);

  const applyPull = useCallback(
    (rawPx: number) => {
      pullRawRef.current = rawPx;
      const visual = dampPull(rawPx, maxPullPx);
      setPullDistance(visual);
      if (statusRef.current === 'refreshing') return;
      setStatusBoth(rawPx >= thresholdPx ? 'ready' : rawPx > 0 ? 'pulling' : 'idle');
    },
    [maxPullPx, setStatusBoth, thresholdPx],
  );

  const triggerRefresh = useCallback(async () => {
    if (statusRef.current === 'refreshing') return;
    setStatusBoth('refreshing');
    setPullDistance(dampPull(thresholdPx, maxPullPx));
    try {
      await onRefreshRef.current();
    } finally {
      pullRawRef.current = 0;
      startYRef.current = null;
      trackingRef.current = false;
      pointerIdRef.current = null;
      wheelAccRef.current = 0;
      setPullDistance(0);
      setStatusBoth('idle');
    }
  }, [maxPullPx, setStatusBoth, thresholdPx]);

  useEffect(() => {
    if (!enabled) {
      resetPull();
      return;
    }
    if (typeof window === 'undefined') return;

    const canStart = () => enabled && statusRef.current !== 'refreshing' && scrollTop() <= AT_TOP_PX && !isPlayerOpen();

    const onTouchStart = (event: TouchEvent) => {
      if (!canStart() || event.touches.length !== 1) return;
      startYRef.current = event.touches[0].clientY;
      trackingRef.current = true;
      pullRawRef.current = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!trackingRef.current || startYRef.current == null) return;
      if (isPlayerOpen() || statusRef.current === 'refreshing') {
        resetPull();
        return;
      }
      const y = event.touches[0].clientY;
      const delta = y - startYRef.current;
      if (delta < ARM_SLOP_PX && pullRawRef.current === 0) return;
      if (scrollTop() > AT_TOP_PX && pullRawRef.current === 0) {
        trackingRef.current = false;
        return;
      }
      if (delta <= 0) {
        applyPull(0);
        return;
      }
      // Own the overscroll so the browser does not rubber-band / native-PTR under us.
      if (event.cancelable) event.preventDefault();
      applyPull(delta);
    };

    const onTouchEnd = () => {
      if (!trackingRef.current) return;
      const shouldRefresh = pullRawRef.current >= thresholdPx;
      trackingRef.current = false;
      startYRef.current = null;
      if (shouldRefresh) {
        void triggerRefresh();
      } else {
        resetPull();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      // Touch is handled above (more reliable preventDefault). Mouse/pen only here.
      if (event.pointerType === 'touch') return;
      if (!canStart() || event.button !== 0) return;
      startYRef.current = event.clientY;
      trackingRef.current = true;
      pointerIdRef.current = event.pointerId;
      pullRawRef.current = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!trackingRef.current || pointerIdRef.current !== event.pointerId) return;
      if (startYRef.current == null) return;
      if (isPlayerOpen() || statusRef.current === 'refreshing') {
        resetPull();
        return;
      }
      const delta = event.clientY - startYRef.current;
      if (delta < ARM_SLOP_PX && pullRawRef.current === 0) return;
      if (scrollTop() > AT_TOP_PX && pullRawRef.current === 0) {
        trackingRef.current = false;
        return;
      }
      if (delta <= 0) {
        applyPull(0);
        return;
      }
      if (event.cancelable) event.preventDefault();
      applyPull(delta);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      if (!trackingRef.current) return;
      const shouldRefresh = pullRawRef.current >= thresholdPx;
      trackingRef.current = false;
      startYRef.current = null;
      pointerIdRef.current = null;
      if (shouldRefresh) {
        void triggerRefresh();
      } else {
        resetPull();
      }
    };

    const clearWheelReset = () => {
      if (wheelResetTimer.current) {
        clearTimeout(wheelResetTimer.current);
        wheelResetTimer.current = null;
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (statusRef.current === 'refreshing' || isPlayerOpen()) return;
      // Only accumulate upward scrolls (negative deltaY) while parked at the top.
      if (scrollTop() > AT_TOP_PX || event.deltaY >= 0) {
        if (wheelAccRef.current > 0 || statusRef.current !== 'idle') {
          wheelAccRef.current = 0;
          resetPull();
        }
        return;
      }
      if (event.cancelable) event.preventDefault();
      wheelAccRef.current += -event.deltaY;
      applyPull(wheelAccRef.current);
      clearWheelReset();
      if (wheelAccRef.current >= wheelThresholdPx) {
        wheelAccRef.current = 0;
        void triggerRefresh();
        return;
      }
      // If the user stops scrolling up, snap back rather than leaving a stuck indicator.
      wheelResetTimer.current = setTimeout(() => {
        wheelAccRef.current = 0;
        if (statusRef.current !== 'refreshing') resetPull();
      }, 180);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('wheel', onWheel);
      clearWheelReset();
    };
  }, [applyPull, enabled, resetPull, thresholdPx, triggerRefresh, wheelThresholdPx]);

  return { status, pullDistance };
}
