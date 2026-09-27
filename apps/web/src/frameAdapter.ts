import { useEffect, useMemo, useRef, useState } from 'react';
import { insertFrameBootstrap, type AdaptedFrameDocument } from './frameBootstrapScript.js';

// Parsers stay out of the shell chunk and off the main thread.
const CACHE_SIZE = 4;
const cache = new Map<string, AdaptedFrameDocument>();
const inFlight = new Map<string, Promise<AdaptedFrameDocument>>();
let inline: ((html: string) => AdaptedFrameDocument) | null = null;

function remember(html: string, adapted: AdaptedFrameDocument): AdaptedFrameDocument {
  cache.delete(html);
  cache.set(html, adapted);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return adapted;
}

async function adaptInline(html: string): Promise<AdaptedFrameDocument> {
  if (!inline) inline = (await import('./frameBootstrap.js')).adaptFrameDocument;
  return inline(html);
}

async function adapt(html: string): Promise<AdaptedFrameDocument> {
  if (typeof Worker === 'undefined') return adaptInline(html);
  try {
    return await (await import('./frameAdapterWorkerClient.js')).adaptInWorker(html);
  } catch {
    return adaptInline(html);
  }
}

// Tests without a Worker opt into synchronous adaptation.
export async function preloadInlineFrameAdapter(): Promise<void> {
  inline = (await import('./frameBootstrap.js')).adaptFrameDocument;
}

export function adaptFrameDocumentNow(html: string): AdaptedFrameDocument | null {
  const hit = cache.get(html);
  if (hit) return remember(html, hit);
  if (!inline || typeof Worker !== 'undefined') return null;
  return remember(html, inline(html));
}

export function adaptFrameDocumentLater(html: string): Promise<AdaptedFrameDocument> {
  const ready = adaptFrameDocumentNow(html);
  if (ready) return Promise.resolve(ready);
  let pending = inFlight.get(html);
  if (!pending) {
    pending = adapt(html)
      .then((adapted) => remember(html, adapted))
      .finally(() => inFlight.delete(html));
    inFlight.set(html, pending);
  }
  return pending;
}

type Shown = { source: string; document: AdaptedFrameDocument };

// Adaptation is async; the previous document stays until it lands.
export function usePreparedFrameDocument(srcDoc: string | undefined): {
  source: string | undefined;
  nonce: string;
  html: string | undefined;
} {
  const [adapted, setAdapted] = useState<Shown | null>(null);
  const ready = srcDoc === undefined ? null : adaptFrameDocumentNow(srcDoc);
  const current = srcDoc === undefined ? null : (ready ?? (adapted?.source === srcDoc ? adapted.document : null));
  const shownRef = useRef<Shown | null>(null);
  if (srcDoc === undefined) shownRef.current = null;
  else if (current && shownRef.current?.source !== srcDoc) shownRef.current = { source: srcDoc, document: current };
  useEffect(() => {
    if (srcDoc === undefined || current) return;
    let live = true;
    void adaptFrameDocumentLater(srcDoc).then((document) => {
      if (live) setAdapted({ source: srcDoc, document });
    });
    return () => {
      live = false;
    };
  }, [srcDoc, current]);
  // Replaced only on a new source, so identical documents never reload.
  const shown = shownRef.current;
  return useMemo(() => {
    const nonce = crypto.randomUUID();
    return { source: shown?.source, nonce, html: shown ? insertFrameBootstrap(shown.document, nonce) : undefined };
  }, [shown]);
}
