import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react';

// Frames whose current document is not one this app loaded.
const navigatedAway = new WeakSet<Window>();

function frameWindow(frame: HTMLIFrameElement | Window | null | undefined): Window | null {
  if (!frame) return null;
  try {
    return 'contentWindow' in frame ? frame.contentWindow : frame;
  } catch {
    // Probing a cross-origin Window throws, so it is one.
    return frame as Window;
  }
}

// True once the game navigated this frame somewhere itself.
export function isGameFrameNavigatedAway(frame: HTMLIFrameElement | Window | null | undefined): boolean {
  const win = frameWindow(frame);
  return win != null && navigatedAway.has(win);
}

// A load the host never requested: the game navigated itself.
export function markGameFrameNavigatedAway(frame: HTMLIFrameElement): void {
  if (frame.contentWindow) navigatedAway.add(frame.contentWindow);
}

// A load the host did request: bridges may answer this document again.
export function markGameFrameLoadedByHost(frame: HTMLIFrameElement): void {
  if (frame.contentWindow) navigatedAway.delete(frame.contentWindow);
}

// Returns onLoad and key; `source` is the srcdoc or src.
export function useHostLoadTracking(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  source: string | undefined,
  afterLoad: () => void,
): { onLoad: () => void; frameKey: number } {
  // True while a document the host asked for has yet to load.
  const hostLoadPending = useRef(true);
  const lastSource = useRef(source);
  const frameKey = useRef(0);
  if (lastSource.current !== source) {
    lastSource.current = source;
    // New content in a flagged frame gets a fresh, unflagged browsing context.
    if (isGameFrameNavigatedAway(frameRef.current)) frameKey.current += 1;
  }
  useLayoutEffect(() => {
    hostLoadPending.current = true;
  }, [source]);

  const onLoad = useCallback(() => {
    const frame = frameRef.current;
    if (frame) {
      if (hostLoadPending.current) markGameFrameLoadedByHost(frame);
      else markGameFrameNavigatedAway(frame);
    }
    hostLoadPending.current = false;
    afterLoad();
  }, [frameRef, afterLoad]);
  return { onLoad, frameKey: frameKey.current };
}

export function isFromGameFrame(event: MessageEvent, frame: HTMLIFrameElement | Window | null | undefined): boolean {
  if (event.origin !== 'null') return false;
  const win = frameWindow(frame);
  // The WindowProxy survives navigation, so source identity alone is not enough.
  return win != null && event.source === win && !isGameFrameNavigatedAway(win);
}
