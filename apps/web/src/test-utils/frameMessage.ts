import { registerFrameDocument } from '../frameDocument.js';

const fixtures = new WeakMap<object, { nonce: string; port: MessagePort; message: MessageEvent | null }>();

export function replaceTestFrameDocument(win: Window): void {
  fixtures.delete(win);
  documentMessage('message', { source: win, data: {} });
}

function createMessage(type: string, options: MessageEventInit): MessageEvent {
  const event = new MessageEvent(type, { ...options, source: undefined });
  Object.defineProperty(event, 'source', { value: options.source ?? null, configurable: true });
  return event;
}

export function documentMessage(type: string, options: MessageEventInit): MessageEvent {
  const win = options.source as Window | null;
  if (!win || win === window) return createMessage(type, options);
  let fixture = fixtures.get(win);
  if (!fixture) {
    const nonce = crypto.randomUUID();
    const port = {
      start() {},
      close() {},
      postMessage: (data: unknown) => win.postMessage(data, '*'),
    } as unknown as MessagePort;
    fixture = { nonce, port, message: null };
    fixtures.set(win, fixture);
    const current = fixture;
    registerFrameDocument(win, nonce, (message) => {
      current.message = message;
    });
    window.dispatchEvent(
      createMessage('message', {
        source: win,
        origin: 'null',
        ports: [port],
        data: { type: 'gdpl-document-ready', documentNonce: nonce },
      }),
    );
  }
  fixture.message = null;
  fixture.port.onmessage?.({ data: { documentNonce: fixture.nonce, payload: options.data } } as MessageEvent);
  const event = fixture.message ?? createMessage(type, options);
  Object.defineProperty(event, 'origin', { value: options.origin ?? '', configurable: true });
  return event;
}

export function messageFromFrame(win: object, data: unknown, origin = 'null'): MessageEvent {
  return documentMessage('message', { data, origin, source: win as Window });
}

export function dispatchFromFrame(win: object, data: unknown, origin = 'null'): void {
  window.dispatchEvent(messageFromFrame(win, data, origin));
}
