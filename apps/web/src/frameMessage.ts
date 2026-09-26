import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react';

// Frames whose current document is not one this app loaded.
const navigatedAway = new WeakSet<Window>();
// Loads seen per frame, so a deferred reply can spot a navigation.
const loadCounts = new WeakMap<Window, number>();

function frameWindow(frame: HTMLIFrameElement | Window | null | undefined): Window | null {
  return (frame && 'contentWindow' in frame ? frame.contentWindow : frame) ?? null;
}

// Identifies the frame's current document; null once navigated away.
export function gameFrameDocumentStamp(frame: HTMLIFrameElement | Window | null | undefined): number | null {
  const win = frameWindow(frame);
  if (!win || navigatedAway.has(win)) return null;
  return loadCounts.get(win) ?? 0;
}

// A load the host never requested: the game navigated itself.
export function markGameFrameNavigatedAway(frame: HTMLIFrameElement): void {
  if (frame.contentWindow) navigatedAway.add(frame.contentWindow);
}

// A load the host did request: bridges may answer this document again.
export function markGameFrameLoadedByHost(frame: HTMLIFrameElement): void {
  if (frame.contentWindow) navigatedAway.delete(frame.contentWindow);
}

// The frame's onLoad; `source` is the srcdoc or src set.
export function useHostLoadTracking(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  source: string | undefined,
  afterLoad: () => void,
): () => void {
  // True while a document the host asked for has yet to load.
  const hostLoadPending = useRef(true);
  useLayoutEffect(() => {
    hostLoadPending.current = true;
  }, [source]);

  return useCallback(() => {
    const frame = frameRef.current;
    if (frame?.contentWindow) {
      loadCounts.set(frame.contentWindow, (loadCounts.get(frame.contentWindow) ?? 0) + 1);
    }
    if (frame) {
      if (hostLoadPending.current) markGameFrameLoadedByHost(frame);
      else markGameFrameNavigatedAway(frame);
    }
    hostLoadPending.current = false;
    afterLoad();
  }, [frameRef, afterLoad]);
}

export function isFromGameFrame(event: MessageEvent, frame: HTMLIFrameElement | Window | null | undefined): boolean {
  if (event.origin !== 'null') return false;
  const win = frameWindow(frame);
  // The WindowProxy survives navigation, so source identity alone is not enough.
  return win != null && event.source === win && !navigatedAway.has(win);
}
