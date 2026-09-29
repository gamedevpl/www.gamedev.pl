// @vitest-environment jsdom
import { documentMessage } from './test-utils/frameMessage.js';

import fs from 'node:fs';
import path from 'node:path';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameFrame } from './GameFrame.js';
import i18n from './i18n/index.js';
import { ImageExportPrompt } from './ImageExportPrompt.js';
import {
  IMAGE_EXPORT_ARM_MS,
  IMAGE_EXPORT_PREFIX,
  IMAGE_EXPORT_PROMPT_MS,
  MAX_IMAGE_EXPORT_CHARS,
  parseImageExportMessage,
  sanitizeImageName,
} from './imageExport.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { setVisitSessionForTesting, VisitSession } from './visitTelemetry.js';

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const PNG_DATA = IMAGE_EXPORT_PREFIX + btoa(String.fromCharCode(...PNG_BYTES));
const GIF_DATA = IMAGE_EXPORT_PREFIX + btoa('GIF89a-not-a-png');
const envelope = { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION };
const PENDING = { ...envelope, t: 'image:export-pending', id: 7 };
const OK = { ...envelope, t: 'image:exported', ok: true, id: 7 };
const REFUSED = { ...envelope, t: 'image:exported', ok: false, id: 7 };

function frame(payload: Record<string, unknown>) {
  return { ...envelope, t: 'image:export', id: 7, ...payload };
}

describe('parseImageExportMessage', () => {
  it('accepts a real PNG and returns its bytes', () => {
    const parsed = parseImageExportMessage(frame({ name: 'Shot', data: PNG_DATA }));
    expect(parsed?.id).toBe(7);
    expect(parsed?.filename).toBe('shot.png');
    expect(Array.from(parsed!.bytes)).toEqual(PNG_BYTES);
  });

  it('requires a non-negative integer id', () => {
    for (const id of [undefined, -1, 1.5, NaN, Infinity, '7', null]) {
      expect(parseImageExportMessage(frame({ id, data: PNG_DATA }))).toBeNull();
    }
    expect(parseImageExportMessage(frame({ id: 0, data: PNG_DATA }))?.id).toBe(0);
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
  return (
    <>
      <ImageExportPrompt frameRef={frameRef} />
      <iframe ref={frameRef} title="game" />
    </>
  );
}

describe('image export prompt', () => {
  let toGame: unknown[];
  let downloads: Array<{ href: string; download: string }>;
  let steps: string[];
  let container: HTMLDivElement;
  let root: Root | null;
  let now: number;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.useFakeTimers();
    toGame = [];
    downloads = [];
    steps = [];
    now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const session = new VisitSession('visit-1', 0, async () => {});
    vi.spyOn(session, 'record').mockImplementation((event) => {
      if (event.type === 'image_export_step') steps.push(event.step);
      return true;
    });
    setVisitSessionForTesting(session);
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
    setVisitSessionForTesting(null);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function attach(iframe: HTMLIFrameElement) {
    const gameWindow = iframe.contentWindow as Window;
    vi.spyOn(gameWindow, 'postMessage').mockImplementation(((message: unknown) => {
      toGame.push(message);
    }) as typeof gameWindow.postMessage);
    return (payload: Record<string, unknown>, source: Window | null = gameWindow, origin = 'null') => {
      act(() => {
        window.dispatchEvent(documentMessage('message', { data: frame(payload), source, origin }));
      });
    };
  }

  function mount() {
    root = createRoot(container);
    act(() => root!.render(<Harness />));
    return attach(container.querySelector('iframe') as HTMLIFrameElement);
  }

  const promptText = () => document.querySelector('.image-export-prompt__text')?.textContent ?? null;
  const saveButton = () => document.querySelector<HTMLButtonElement>('.image-export-prompt__save');
  const dismissButton = () => document.querySelector<HTMLButtonElement>('.image-export-prompt__dismiss');
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it('prompts first, replies pending, and downloads nothing on its own', () => {
    const fromGame = mount();

    fromGame({ name: 'Best Run', data: PNG_DATA });

    expect(promptText()).toBe('This game wants to save a photo: best-run.png');
    expect(document.querySelector('.image-export-prompt img, .image-export-prompt canvas')).toBeNull();
    expect(document.body.innerHTML).not.toContain('base64');
    expect(document.querySelector('.image-export-prompt')?.parentElement).toBe(document.body);
    expect(toGame).toEqual([PENDING]);
    expect(downloads).toHaveLength(0);
    expect(steps).toEqual(['requested']);
  });

  it('downloads from the Save click and replies ok:true', () => {
    const fromGame = mount();
    fromGame({ name: 'Best Run', data: PNG_DATA });

    expect(saveButton()!.disabled).toBe(true);
    advance(IMAGE_EXPORT_ARM_MS);
    act(() => saveButton()!.click());

    expect(downloads).toEqual([{ href: 'blob:shell/1', download: 'best-run.png' }]);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(PNG_BYTES.length);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(toGame).toEqual([PENDING, OK]);
    expect(promptText()).toBeNull();
    expect(steps).toEqual(['requested', 'saved']);

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    advance(2000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:shell/1');
  });

  it('replies ok:false on Not now without downloading', () => {
    const fromGame = mount();
    fromGame({ name: 'x', data: PNG_DATA });

    act(() => dismissButton()!.click());

    expect(downloads).toHaveLength(0);
    expect(toGame).toEqual([PENDING, REFUSED]);
    expect(promptText()).toBeNull();
    expect(steps).toEqual(['requested', 'dismissed']);
  });

  it('lapses with ok:false after the prompt timeout', () => {
    const fromGame = mount();
    fromGame({ name: 'x', data: PNG_DATA });

    advance(IMAGE_EXPORT_PROMPT_MS - 1);
    expect(promptText()).not.toBeNull();
    advance(1);

    expect(promptText()).toBeNull();
    expect(downloads).toHaveLength(0);
    expect(toGame).toEqual([PENDING, REFUSED]);
  });

  it('refuses a second request while one is pending, echoing its own id', () => {
    const fromGame = mount();
    fromGame({ name: 'first', data: PNG_DATA });
    now += 5000;

    fromGame({ id: 8, name: 'second', data: PNG_DATA });

    expect(toGame).toEqual([PENDING, { ...REFUSED, id: 8 }]);
    expect(promptText()).toContain('first.png');
    expect(steps).toEqual(['requested', 'rejected']);
  });

  it('echoes each request id on its replies, and refuses one without an id', () => {
    const fromGame = mount();
    fromGame({ id: 41, name: 'x', data: PNG_DATA });
    act(() => dismissButton()!.click());
    now += 5000;
    fromGame({ id: 'nope', name: 'y', data: PNG_DATA });

    expect(toGame).toEqual([
      { ...PENDING, id: 41 },
      { ...REFUSED, id: 41 },
      { ...envelope, t: 'image:exported', ok: false },
    ]);
    expect(promptText()).toBeNull();
  });

  it('ignores exports from another window or a non-opaque origin', () => {
    const fromGame = mount();
    const impostor = document.createElement('iframe');
    document.body.appendChild(impostor);

    fromGame({ name: 'x', data: PNG_DATA }, impostor.contentWindow);
    fromGame({ name: 'x', data: PNG_DATA }, undefined, 'https://evil.example');

    impostor.remove();
    expect(promptText()).toBeNull();
    expect(toGame).toHaveLength(0);
  });

  it.each([
    ['non-PNG bytes', GIF_DATA],
    ['a wrong prefix', PNG_DATA.replace('data:image/png', 'data:text/html')],
    ['an oversized payload', PNG_DATA + 'A'.repeat(MAX_IMAGE_EXPORT_CHARS)],
  ])('rejects %s with ok:false and no prompt', (_label, data) => {
    const fromGame = mount();

    fromGame({ name: 'x', data });

    expect(promptText()).toBeNull();
    expect(toGame).toEqual([REFUSED]);
    expect(steps).toEqual(['rejected']);
  });

  it('allows one request per interval', () => {
    const fromGame = mount();

    fromGame({ name: 'a', data: PNG_DATA });
    act(() => dismissButton()!.click());
    now += 500;
    fromGame({ name: 'b', data: PNG_DATA });
    now += 1000;
    fromGame({ name: 'c', data: PNG_DATA });

    expect(toGame).toEqual([PENDING, REFUSED, REFUSED, PENDING]);
    expect(promptText()).toContain('c.png');
  });

  it('is wired into GameFrame, which every play surface renders', async () => {
    root = createRoot(container);
    act(() => root!.render(<GameFrame title="game" html="<!doctype html><p>game</p>" autoFocus={false} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const fromGame = attach(container.querySelector('iframe') as HTMLIFrameElement);

    fromGame({ name: 'From Frame', data: PNG_DATA });

    expect(promptText()).toBe('This game wants to save a photo: from-frame.png');
    expect(toGame).toEqual([PENDING]);
  });

  it('keeps every play surface on GameFrame', () => {
    const read = (file: string) => fs.readFileSync(path.join(__dirname, file), 'utf8');
    expect(read('PublishedGameFrame.tsx')).toContain('<GameFrame');
    expect(read('GameTheater.tsx')).toMatch(/<(Published)?GameFrame/);
    expect(read('surfaces/studio/StudioStage.tsx')).toContain('<GameFrame');
    expect(read('surfaces/party/PartyPlaying.tsx')).toContain('<PublishedGameFrame');
  });
});
