import { useEffect, useState, type RefObject } from 'react';

// 768+460: leftover bar after the side rail is still phone-narrow.
const NARROW_RAIL_QUERY = '(min-width: 761px) and (max-width: 1228px)';
// 900+460: howto/mic still overflow that leftover bar.
const MID_RAIL_QUERY = '(min-width: 761px) and (max-width: 1360px)';

function useTheaterBreakpoint(phoneQuery: string, railQuery: string, agentOpen: boolean): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const phone = matchMedia(phoneQuery);
    const withRail = matchMedia(railQuery);
    const update = () => setMatches(phone.matches || (agentOpen && withRail.matches));
    update();
    phone.addEventListener('change', update);
    withRail.addEventListener('change', update);
    return () => {
      phone.removeEventListener('change', update);
      withRail.removeEventListener('change', update);
    };
  }, [agentOpen, phoneQuery, railQuery]);
  return matches;
}

export function useTheaterNarrow(agentOpen: boolean): boolean {
  return useTheaterBreakpoint('(max-width: 768px)', NARROW_RAIL_QUERY, agentOpen);
}

export function useTheaterMidWidth(agentOpen: boolean): boolean {
  return useTheaterBreakpoint('(max-width: 900px)', MID_RAIL_QUERY, agentOpen);
}

// Keyboard shrinks visualViewport; 100dvh does not.
export function useAgentViewportTrack(enabled: boolean, rootRef: RefObject<HTMLElement | null>): boolean {
  const [tracked, setTracked] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setTracked(false);
      return;
    }
    const viewport = window.visualViewport;
    const root = rootRef.current;
    if (!viewport || !root) return;

    const sync = () => {
      root.style.setProperty('--agent-visual-height', `${viewport.height}px`);
      root.style.setProperty('--agent-visual-offset', `${viewport.offsetTop}px`);
    };

    sync();
    setTracked(true);
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
      root.style.removeProperty('--agent-visual-height');
      root.style.removeProperty('--agent-visual-offset');
    };
  }, [enabled, rootRef]);
  return tracked;
}
