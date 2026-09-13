import { useEffect } from 'react';

export const HANDOFF_CLICK_GUARD_MS = 500;

// Swallow the welcome tap so it cannot hit Studio chrome.
export function useHandoffClickGuard(windowMs = HANDOFF_CLICK_GUARD_MS): void {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('from') !== 'handoff') return;
    const until = Date.now() + windowMs;
    const block = (event: Event) => {
      if (Date.now() >= until) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('click', block, true);
    return () => document.removeEventListener('click', block, true);
  }, [windowMs]);
}
