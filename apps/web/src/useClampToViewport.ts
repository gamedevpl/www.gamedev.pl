import { useLayoutEffect, useRef, type RefObject } from 'react';
import { notificationPanelShiftX } from './notificationPanelPosition.js';

// Keeps a left-anchored popover from overflowing the viewport's right edge.
export function useClampToViewport<T extends HTMLElement>(active: boolean): RefObject<T> {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;

    const place = () => {
      panel.style.transform = '';
      const shift = notificationPanelShiftX(panel.getBoundingClientRect(), window.innerWidth);
      panel.style.transform = shift === 0 ? '' : `translateX(${shift}px)`;
    };

    place();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      panel.style.transform = '';
    };
  }, [active]);

  return ref as RefObject<T>;
}
