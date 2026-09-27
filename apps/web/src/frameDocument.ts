type FrameDocument = { nonce: string; port: MessagePort | null; dispatch: (event: MessageEvent) => void };
const documents = new WeakMap<Window, FrameDocument>();
const authenticated = new WeakSet<MessageEvent>();

export function registerFrameDocument(
  win: Window,
  nonce: string,
  dispatch: (event: MessageEvent) => void = (event) => {
    window.dispatchEvent(event);
  },
): () => void {
  documents.get(win)?.port?.close();
  const state: FrameDocument = { nonce, port: null, dispatch };
  documents.set(win, state);
  return () => {
    if (documents.get(win) !== state) return;
    state.port?.close();
    documents.delete(win);
  };
}

export function retireFrameDocument(win: Window): void {
  documents.get(win)?.port?.close();
  documents.delete(win);
}

export function isFrameDocumentMessage(event: MessageEvent, win: Window): boolean {
  const state = documents.get(win);
  return state?.port != null && authenticated.has(event) && event.data?.documentNonce === state.nonce;
}

export function bindFrameDocumentMessage(win: Window): (event: MessageEvent) => boolean {
  const state = documents.get(win);
  return (event) => state !== undefined && documents.get(win) === state && isFrameDocumentMessage(event, win);
}

export function bindFrameDocumentReply(win: Window | null): (payload: unknown) => boolean {
  const state = win && documents.get(win);
  return (payload) => {
    if (!win || !state || documents.get(win) !== state || !state.port) return false;
    state.port.postMessage(payload);
    return true;
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.origin !== 'null' || !event.source || event.data?.type !== 'gdpl-document-ready') return;
    const state = documents.get(event.source as Window);
    if (!state || state.port || event.data.documentNonce !== state.nonce || event.ports.length !== 1) return;
    state.port = event.ports[0]!;
    const win = event.source as Window;
    state.port.onmessage = (event) => {
      if (documents.get(win) !== state || event.data?.documentNonce !== state.nonce) return;
      const payload = event.data.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
      const message = new MessageEvent('message', {
        origin: 'null',
        data: { ...payload, documentNonce: state.nonce },
      });
      Object.defineProperty(message, 'source', { value: win });
      authenticated.add(message);
      state.dispatch(message);
    };
    state.port.start();
  });
}
