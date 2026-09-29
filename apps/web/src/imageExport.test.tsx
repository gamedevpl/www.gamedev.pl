// @vitest-environment jsdom
import { documentMessage } from './test-utils/frameMessage.js';

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_EXPORT_PREFIX,
  MAX_IMAGE_EXPORT_CHARS,
  parseImageExportMessage,
  sanitizeImageName,
  useImageExportBridge,
} from './imageExport.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const PNG_DATA = IMAGE_EXPORT_PREFIX + btoa(String.fromCharCode(...PNG_BYTES));
const GIF_DATA = IMAGE_EXPORT_PREFIX + btoa('GIF89a-not-a-png');

function frame(payload: Record<string, unknown>) {
  return { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'image:export', ...payload };
}

describe('parseImageExportMessage', () => {
  it('accepts a real PNG and returns its bytes', () => {
    const parsed = parseImageExportMessage(frame({ name: 'Shot', data: PNG_DATA }));
    expect(parsed?.filename).toBe('shot.png');
    expect(Array.from(parsed!.bytes)).toEqual(PNG_BYTES);
  });

  it('rejects wrong envelopes, prefixes, content and sizes', () => {
    expect(parseImageExportMessage({ t: 'image:export', data: PNG_DATA })).toBeNull();
    expect(parseImageExportMessage(frame({ t: 'save:put', data: PNG_DATA }))).toBeNull();
    expect(parseImageExportMessage(frame({ data: 42 }))).toBeNull();
    expect(parseImageExportMessage(frame({ data: PNG_DATA.replace('image/png', 'image/jpeg') }))).toBeNull();
    expect(parseImageExportMessage(frame({ data: ` ${PNG_DATA}` }))).toBeNull();
    expect(parseImageExportMessage(frame({ data: GIF_DATA }))).toBeNull();
    expect(parseImageExportMessage(frame({ data: `${IMAGE_EXPORT_PREFIX}%%%not-base64` }))).toBeNull();
    const oversized = PNG_DATA + 'A'.repeat(MAX_IMAGE_EXPORT_CHARS);
    expect(parseImageExportMessage(frame({ data: oversized }))).toBeNull();
  });
});

describe('sanitizeImageName', () => {
  it('keeps only lowercase slug characters and forces .png', () => {
    expect(sanitizeImageName('My Cool  Photo!!')).toBe('my-cool-photo.png');
    expect(sanitizeImageName('../../etc/passwd')).toBe('etc-passwd.png');
    expect(sanitizeImageName('run.exe')).toBe('run-exe.png');
    expect(sanitizeImageName('Snapshot.PNG')).toBe('snapshot.png');
    expect(sanitizeImageName('a---b')).toBe('a-b.png');
  });

  it('caps the length and falls back to photo', () => {
    expect(sanitizeImageName('x'.repeat(100))).toBe(`${'x'.repeat(48)}.png`);
    expect(sanitizeImageName('')).toBe('photo.png');
    expect(sanitizeImageName('!!!')).toBe('photo.png');
    expect(sanitizeImageName(undefined)).toBe('photo.png');
    expect(sanitizeImageName({ toString: () => 'x' })).toBe('photo.png');
  });
});

function Harness() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  useImageExportBridge(frameRef);
  return <iframe ref={frameRef} title="game" />;
}

describe('useImageExportBridge', () => {
  let toGame: unknown[];
  let downloads: Array<{ href: string; download: string }>;
  let container: HTMLDivElement;
  let root: Root | null;
  let now: number;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    toGame = [];
    downloads = [];
    now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    URL.createObjectURL = vi.fn(() => 'blob:shell/1');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, download: this.download });
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = null;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mount() {
    root = createRoot(container);
    act(() => root!.render(<Harness />));
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const gameWindow = iframe.contentWindow as Window;
    vi.spyOn(gameWindow, 'postMessage').mockImplementation(((message: unknown) => {
      toGame.push(message);
    }) as typeof gameWindow.postMessage);
    const fromGame = (payload: Record<string, unknown>, source: Window | null = gameWindow, origin = 'null') => {
      window.dispatchEvent(documentMessage('message', { data: frame(payload), source, origin }));
    };
    return { fromGame };
  }

  it('downloads a valid PNG from the shell and replies ok', () => {
    vi.useFakeTimers();
    const { fromGame } = mount();

    fromGame({ name: 'Best Run', data: PNG_DATA });

    expect(downloads).toEqual([{ href: 'blob:shell/1', download: 'best-run.png' }]);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(PNG_BYTES.length);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(toGame).toEqual([{ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'image:exported', ok: true }]);

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:shell/1');
  });

  it('ignores exports from another window or a non-opaque origin', () => {
    const { fromGame } = mount();
    const impostor = document.createElement('iframe');
    document.body.appendChild(impostor);

    fromGame({ name: 'x', data: PNG_DATA }, impostor.contentWindow);
    fromGame({ name: 'x', data: PNG_DATA }, undefined, 'https://evil.example');

    impostor.remove();
    expect(downloads).toHaveLength(0);
    expect(toGame).toHaveLength(0);
  });

  it.each([
    ['non-PNG bytes', GIF_DATA],
    ['a wrong prefix', PNG_DATA.replace('data:image/png', 'data:text/html')],
    ['an oversized payload', PNG_DATA + 'A'.repeat(MAX_IMAGE_EXPORT_CHARS)],
  ])('rejects %s with ok:false', (_label, data) => {
    const { fromGame } = mount();

    fromGame({ name: 'x', data });

    expect(downloads).toHaveLength(0);
    expect(toGame).toEqual([{ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'image:exported', ok: false }]);
  });

  it('allows one export per interval', () => {
    const { fromGame } = mount();

    fromGame({ name: 'a', data: PNG_DATA });
    now += 500;
    fromGame({ name: 'b', data: PNG_DATA });
    now += 1000;
    fromGame({ name: 'c', data: PNG_DATA });

    expect(downloads.map((d) => d.download)).toEqual(['a.png', 'c.png']);
    expect(toGame.map((m) => (m as { ok: boolean }).ok)).toEqual([true, false, true]);
  });
});
