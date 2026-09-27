// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  bindFrameDocumentMessage,
  bindFrameDocumentReply,
  registerFrameDocument,
  retireFrameDocument,
} from './frameDocument.js';
import {
  isFromGameFrame,
  isGameFrameNavigatedAway,
  markGameFrameLoadedByHost,
  prepareGameFrameDocument,
  postToGameFrame,
} from './frameMessage.js';

function message(win: Window, data: unknown, ports: MessagePort[] = [], origin = 'null') {
  return new MessageEvent('message', { source: win, origin, data, ports });
}

function documentFixture(nonce: string) {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const win = frame.contentWindow!;
  const received: MessageEvent[] = [];
  const release = registerFrameDocument(win, nonce, (event) => received.push(event));
  const port = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn() } as unknown as MessagePort;
  const request = (documentNonce: string, payload = {}) => {
    received.length = 0;
    port.onmessage?.({ data: { documentNonce, payload } } as MessageEvent);
    return received[0] ?? message(win, { documentNonce });
  };
  return { frame, win, port, release, received, request };
}

describe('document capabilities', () => {
  it('reports undelivered messages until the private port is ready', () => {
    const { frame, win, port, release } = documentFixture('expected');
    expect(postToGameFrame(frame, { held: true })).toBe(false);
    window.dispatchEvent(message(win, { type: 'gdpl-document-ready', documentNonce: 'expected' }, [port]));
    expect(postToGameFrame(frame, { held: true })).toBe(true);
    expect(port.postMessage).toHaveBeenCalledWith({ held: true });
    release();
    frame.remove();
  });
  it('retires resources only on an authenticated document lifecycle message', () => {
    const { frame, win, port, release } = documentFixture('expected');
    const close = prepareGameFrameDocument(frame, 'expected');
    window.dispatchEvent(message(win, { type: 'gdpl-document-ready', documentNonce: 'expected' }, [port]));
    window.dispatchEvent(message(win, { type: 'gdpl-document-retired', documentNonce: 'expected' }));
    expect(isGameFrameNavigatedAway(frame)).toBe(false);
    port.onmessage?.({
      data: { documentNonce: 'expected', payload: { type: 'gdpl-document-retired' } },
    } as MessageEvent);
    expect(isGameFrameNavigatedAway(frame)).toBe(true);
    expect(port.close).toHaveBeenCalledOnce();
    close();
    release();
    frame.remove();
  });
  it('does not authorize the first load, a missing nonce, or a guessed nonce', () => {
    const { frame, win, port, release } = documentFixture('expected');
    markGameFrameLoadedByHost(frame);
    expect(isFromGameFrame(message(win, {}), frame)).toBe(false);
    window.dispatchEvent(message(win, { type: 'gdpl-document-ready', documentNonce: 'wrong' }, [port]));
    expect(isFromGameFrame(message(win, { documentNonce: 'expected' }), frame)).toBe(false);
    expect(port.start).not.toHaveBeenCalled();
    release();
    frame.remove();
  });

  it('accepts only a nonce proven by its original document and replies through its port', () => {
    const { frame, win, port, release, request } = documentFixture('expected');
    window.dispatchEvent(message(win, { type: 'gdpl-document-ready', documentNonce: 'expected' }, [port]));
    expect(isFromGameFrame(request('expected'), frame)).toBe(true);
    expect(isFromGameFrame(request('wrong'), frame)).toBe(false);
    expect(isFromGameFrame(message(win, { documentNonce: 'expected' }), frame)).toBe(false);
    expect(isFromGameFrame(message(win, { documentNonce: 'expected' }, [], 'https://attacker.test'), frame)).toBe(
      false,
    );
    bindFrameDocumentReply(win)({ secret: 'save' });
    expect(port.postMessage).toHaveBeenCalledWith({ secret: 'save' });
    release();
    frame.remove();
  });

  it('revokes old nonces and delayed replies across replacement in the same WindowProxy', () => {
    const { frame, win, port, release } = documentFixture('one');
    window.dispatchEvent(message(win, { type: 'gdpl-document-ready', documentNonce: 'one' }, [port]));
    const delayed = bindFrameDocumentReply(win);
    const fromOriginal = bindFrameDocumentMessage(win);
    const received: MessageEvent[] = [];
    const closeNew = registerFrameDocument(win, 'two', (event) => received.push(event));
    const nextPort = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn() } as unknown as MessagePort;
    window.dispatchEvent(message(win, { type: 'gdpl-document-ready', documentNonce: 'two' }, [nextPort]));
    release();
    delayed({ secret: 'old save' });
    expect(port.close).toHaveBeenCalledOnce();
    expect(nextPort.postMessage).not.toHaveBeenCalled();
    expect(isFromGameFrame(message(win, { documentNonce: 'one' }), frame)).toBe(false);
    nextPort.onmessage?.({ data: { documentNonce: 'two', payload: {} } } as MessageEvent);
    expect(isFromGameFrame(received[0]!, frame)).toBe(true);
    expect(fromOriginal(received[0]!)).toBe(false);
    retireFrameDocument(win);
    expect(isFromGameFrame(message(win, { documentNonce: 'two' }), frame)).toBe(false);
    closeNew();
    frame.remove();
  });
});
