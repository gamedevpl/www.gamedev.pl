import { useCallback, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { platform } from './platform/index.js';
import { orientationLockTarget, useOrientationLock } from './useOrientationLock.js';
import type { DesiredOrientation } from './useOrientationMismatch.js';

export function useTheaterFullscreen(options: {
  stageRef: MutableRefObject<HTMLElement | null>;
  frameRef: MutableRefObject<HTMLIFrameElement | null>;
  orientation: DesiredOrientation;
  agentOpen: boolean;
}) {
  const { stageRef, frameRef, orientation, agentOpen } = options;
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const canFullscreen = Boolean(document.fullscreenEnabled);
  const canOrientationLock = platform.orientation.canLock();
  const isStandalone = platform.install.isStandalone();
  const lockTarget = orientationLockTarget(orientation);
  const lockTargetRef = useRef(lockTarget);
  lockTargetRef.current = lockTarget;

  useOrientationLock(orientation, fullscreen || isStandalone);

  // Attach before auto-fullscreen so synchronous fullscreenchange events are never missed.
  useLayoutEffect(() => {
    setFullscreen(Boolean(document.fullscreenElement));
    const onChange = () => {
      const next = Boolean(document.fullscreenElement);
      setFullscreen(next);
      if (!next && !isStandalone) platform.orientation.unlock();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [isStandalone]);

  const enterFullscreenAndLock = useCallback(() => {
    const stage = stageRef.current;
    if (!stage?.requestFullscreen) return;
    const target = lockTargetRef.current;
    void stage.requestFullscreen().then(
      () => {
        setFullscreen(Boolean(document.fullscreenElement));
        if (target) void platform.orientation.lock(target);
      },
      () => undefined,
    );
    // Hand focus back to the game after fullscreen expands the wrapper.
    setTimeout(() => frameRef.current?.contentWindow?.focus(), 100);
  }, [frameRef, stageRef]);

  const exitFullscreenAndUnlock = useCallback(() => {
    platform.orientation.unlock();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      exitFullscreenAndUnlock();
      setTimeout(() => frameRef.current?.contentWindow?.focus(), 100);
    } else {
      enterFullscreenAndLock();
    }
  }, [enterFullscreenAndLock, exitFullscreenAndUnlock, frameRef]);

  const autoFullscreenTriedRef = useRef(false);
  useLayoutEffect(() => {
    if (autoFullscreenTriedRef.current || !lockTarget || !canFullscreen || !canOrientationLock || agentOpen) return;
    if (document.fullscreenElement || typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches)
      return;
    // Lock touch devices into the game's orientation during the Play gesture.
    autoFullscreenTriedRef.current = true;
    enterFullscreenAndLock();
  }, [agentOpen, canFullscreen, canOrientationLock, enterFullscreenAndLock, lockTarget]);

  return {
    fullscreen,
    canFullscreen,
    canOrientationLock,
    enterFullscreenAndLock,
    exitFullscreenAndUnlock,
    toggleFullscreen,
  };
}
