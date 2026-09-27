import { notifyFrameDocument } from './frameLifecycle.js';
import {
  bindFrameDocumentReply,
  isFrameDocumentMessage,
  registerFrameDocument,
  retireFrameDocument,
} from './frameDocument.js';
import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react';

// Frames whose current document is not one this app loaded.
const navigatedAway = new WeakSet<Window>();
const preparedFrames = new WeakSet<HTMLIFrameElement>();

function frameWindow(frame: HTMLIFrameElement | Window | null | undefined): Window | null {
  if (!frame) return null;
  return typeof HTMLIFrameElement !== 'undefined' && frame instanceof HTMLIFrameElement
    ? frame.contentWindow
    : (frame as Window);
}

// True once the game navigated this frame somewhere itself.
export function isGameFrameNavigatedAway(frame: HTMLIFrameElement | Window | null | undefined): boolean {
  const win = frameWindow(frame);
  return win != null && navigatedAway.has(win);
}

// A load the host never requested: the game navigated itself.
export function markGameFrameNavigatedAway(frame: HTMLIFrameElement): void {
  if (frame.contentWindow) {
    navigatedAway.add(frame.contentWindow);
    retireFrameDocument(frame.contentWindow);
  }
  notifyFrameDocument(frame, true);
}

// A load the host did request: bridges may answer this document again.
export function markGameFrameLoadedByHost(frame: HTMLIFrameElement): void {
  if (frame.contentWindow) navigatedAway.delete(frame.contentWindow);
  if (!preparedFrames.delete(frame)) notifyFrameDocument(frame, false);
}

export function prepareGameFrameDocument(frame: HTMLIFrameElement, nonce: string): () => void {
  const win = frame.contentWindow;
  if (!win) return () => {};
  preparedFrames.add(frame);
  const release = registerFrameDocument(win, nonce, (event) => {
    if (event.data.type === 'gdpl-document-retired') markGameFrameNavigatedAway(frame);
    else window.dispatchEvent(event);
  });
  notifyFrameDocument(frame, true);
  return release;
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
  return win != null && event.source === win && !isGameFrameNavigatedAway(win) && isFrameDocumentMessage(event, win);
}

export function postToGameFrame(frame: HTMLIFrameElement | null, payload: unknown): boolean {
  if (!frame || isGameFrameNavigatedAway(frame)) return false;
  return bindFrameDocumentReply(frame.contentWindow)(payload);
}

export function bindGameFrameReply(frame: HTMLIFrameElement | null): (payload: unknown) => void {
  const win = frame?.contentWindow ?? null;
  const reply = bindFrameDocumentReply(win);
  return (payload) => {
    if (!isGameFrameNavigatedAway(win)) reply(payload);
  };
}
