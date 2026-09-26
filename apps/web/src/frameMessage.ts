import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react';

// Frames whose current document is not one this app loaded.
const navigatedAway = new WeakSet<Window>();

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
  const win = frame && 'contentWindow' in frame ? frame.contentWindow : frame;
  // The WindowProxy survives navigation, so source identity alone is not enough.
  return win != null && event.source === win && !navigatedAway.has(win);
}
