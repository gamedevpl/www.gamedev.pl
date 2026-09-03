import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

const GRIP_DRAG_PX = 40;

// The sheet's handle: drag past the threshold, else tap-toggle.
export function useRemixGrip({
  expanded,
  setExpanded,
  chromeHidden,
  onRevealChrome,
}: {
  expanded: boolean;
  setExpanded: (next: boolean) => void;
  chromeHidden?: boolean;
  onRevealChrome?: () => void;
}) {
  const dragRef = useRef<{ startY: number; moved: boolean } | null>(null);
  const dragConsumedRef = useRef(false);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragConsumedRef.current = false;
    dragRef.current = { startY: event.clientY, moved: false };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dy) < GRIP_DRAG_PX) return;
    drag.moved = true;
    dragConsumedRef.current = true;
    if (dy > GRIP_DRAG_PX) {
      dragRef.current = null;
      setExpanded(false);
    } else if (dy < -GRIP_DRAG_PX) {
      dragRef.current = null;
      setExpanded(true);
      onRevealChrome?.();
    }
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onActivate() {
    // A completed drag already changed state; don't toggle again.
    if (dragConsumedRef.current) {
      dragConsumedRef.current = false;
      return;
    }
    if (!expanded || chromeHidden) {
      setExpanded(true);
      onRevealChrome?.();
      return;
    }
    setExpanded(false);
  }

  return { onPointerDown, onPointerMove, onPointerUp, onActivate };
}
