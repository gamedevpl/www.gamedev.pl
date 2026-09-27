import { useEffect, useState, type MutableRefObject } from 'react';

const watchers = new Map<MutableRefObject<HTMLIFrameElement | null>, Set<(navigation: boolean) => void>>();

export function notifyFrameDocument(frame: HTMLIFrameElement, navigation: boolean): void {
  for (const [ref, listeners] of watchers) {
    if (ref.current === frame) for (const listener of listeners) listener(navigation);
  }
}

export function useFrameDocument(ref: MutableRefObject<HTMLIFrameElement | null>): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const listeners = watchers.get(ref) ?? new Set<(navigation: boolean) => void>();
    const listener = (navigation: boolean) => setEpoch((value) => (navigation || value > 0 ? value + 1 : value));
    listeners.add(listener);
    watchers.set(ref, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) watchers.delete(ref);
    };
  }, [ref]);
  return epoch;
}
