// @vitest-environment jsdom
import { documentMessage } from './test-utils/frameMessage.js';

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameFrame } from './GameFrame.js';
import i18n from './i18n/index.js';
import { ImageExportPrompt, VideoExportPrompt } from './ImageExportPrompt.js';
import { FILE_EXPORT_ARM_MS, FILE_EXPORT_PROMPT_MS } from './fileExport.js';
import { MAX_VIDEO_EXPORT_BYTES, parseVideoExportMessage, sanitizeVideoName, sniffVideo } from './videoExport.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { setVisitSessionForTesting, VisitSession } from './visitTelemetry.js';

const MP4_BYTES = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0];
const WEBM_BYTES = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81];
const buffer = (bytes: number[]) => new Uint8Array(bytes).buffer;
const envelope = { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION };
const PENDING = { ...envelope, t: 'video:export-pending', id: 3 };
const OK = { ...envelope, t: 'video:exported', ok: true, id: 3 };
const REFUSED = { ...envelope, t: 'video:exported', ok: false, id: 3 };

function frame(payload: Record<string, unknown>) {
  return { ...envelope, t: 'video:export', id: 3, ...payload };
}

describe('parseVideoExportMessage', () => {
  it('accepts MP4 and WebM bytes and types them from the container', () => {
    const mp4 = parseVideoExportMessage(frame({ name: 'Best Moment', data: buffer(MP4_BYTES) }));
    expect(mp4).toMatchObject({ id: 3, filename: 'best-moment.mp4', mime: 'video/mp4' });
    expect(Array.from(mp4!.bytes)).toEqual(MP4_BYTES);
    // A WebM named .mp4 is still saved as WebM.
    const webm = parseVideoExportMessage(frame({ name: 'clip.mp4', data: buffer(WEBM_BYTES) }));
    expect(webm).toMatchObject({ filename: 'clip.webm', mime: 'video/webm' });
  });

  it('requires a non-negative integer id', () => {
    for (const id of [undefined, -1, 1.5, '3', null]) {
      expect(parseVideoExportMessage(frame({ id, data: buffer(MP4_BYTES) }))).toBeNull();
    }
  });

  it('rejects other envelopes, payload types, containers and sizes', () => {
    expect(parseVideoExportMessage({ t: 'video:export', id: 3, data: buffer(MP4_BYTES) })).toBeNull();
    expect(parseVideoExportMessage(frame({ t: 'image:export', data: buffer(MP4_BYTES) }))).toBeNull();
    expect(parseVideoExportMessage(frame({ data: 'data:video/mp4;base64,AAAA' }))).toBeNull();
    expect(parseVideoExportMessage(frame({ data: new Uint8Array(MP4_BYTES) }))).toBeNull();
    expect(
      parseVideoExportMessage(frame({ data: buffer([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]) })),
    ).toBeNull();
    expect(parseVideoExportMessage(frame({ data: buffer(MP4_BYTES.slice(0, 8)) }))).toBeNull();
    const oversized = new Uint8Array(MAX_VIDEO_EXPORT_BYTES + 1);
    oversized.set(MP4_BYTES);
    expect(parseVideoExportMessage(frame({ data: oversized.buffer }))).toBeNull();
  });
});

describe('sanitizeVideoName / sniffVideo', () => {
  it('slugs the name, forces the sniffed extension and falls back to clip', () => {
    expect(sanitizeVideoName('Biplane Skirmish: Zeppelin!', 'mp4')).toBe('biplane-skirmish-zeppelin.mp4');
    expect(sanitizeVideoName('Run.WEBM', 'webm')).toBe('run.webm');
    expect(sanitizeVideoName('../x.exe', 'mp4')).toBe('x-exe.mp4');
    expect(sanitizeVideoName('', 'mp4')).toBe('clip.mp4');
    expect(sanitizeVideoName(undefined, 'webm')).toBe('clip.webm');
  });

  it('knows only ISO BMFF and EBML headers', () => {
    expect(sniffVideo(new Uint8Array(MP4_BYTES))?.extension).toBe('mp4');
    expect(sniffVideo(new Uint8Array(WEBM_BYTES))?.extension).toBe('webm');
    expect(sniffVideo(new Uint8Array(16))).toBeNull();
  });
});

function Harness() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  return (
    <>
      <ImageExportPrompt frameRef={frameRef} />
      <VideoExportPrompt frameRef={frameRef} />
      <iframe ref={frameRef} title="game" />
    </>
  );
}

describe('video export prompt', () => {
  let toGame: unknown[];
  let downloads: Array<{ download: string }>;
  let blobs: Blob[];
  let steps: string[];
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.useFakeTimers();
    toGame = [];
    downloads = [];
    blobs = [];
    steps = [];
    vi.spyOn(Date, 'now').mockImplementation(() => 10_000);
    const session = new VisitSession('visit-1', 0, async () => {});
    vi.spyOn(session, 'record').mockImplementation((event) => {
      if (event.type === 'video_export_step') steps.push(event.step);
      if (event.type === 'image_export_step') steps.push(`image:${event.step}`);
      return true;
    });
    setVisitSessionForTesting(session);
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:shell/1';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ download: this.download });
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
    return (payload: Record<string, unknown>) => {
      act(() => {
        window.dispatchEvent(documentMessage('message', { data: frame(payload), source: gameWindow, origin: 'null' }));
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

  it('asks first, then saves the typed bytes from the Save click', async () => {
    const fromGame = mount();

    fromGame({ name: 'Zeppelin downed', data: buffer(MP4_BYTES) });

    expect(promptText()).toBe('This game wants to save a video clip: zeppelin-downed.mp4');
    expect(toGame).toEqual([PENDING]);
    expect(downloads).toEqual([]);
    expect(saveButton()!.disabled).toBe(true);

    advance(FILE_EXPORT_ARM_MS);
    act(() => saveButton()!.click());

    expect(downloads).toEqual([{ download: 'zeppelin-downed.mp4' }]);
    expect(blobs[0]!.type).toBe('video/mp4');
    expect(new Uint8Array(await blobs[0]!.arrayBuffer())).toEqual(new Uint8Array(MP4_BYTES));
    expect(toGame).toEqual([PENDING, OK]);
    expect(steps).toEqual(['requested', 'saved']);
    expect(promptText()).toBeNull();
  });

  it('replies ok:false on Not now and on timeout, and refuses bad bytes', () => {
    const fromGame = mount();

    fromGame({ data: buffer(MP4_BYTES) });
    act(() => dismissButton()!.click());
    expect(downloads).toEqual([]);

    vi.mocked(Date.now).mockImplementation(() => 20_000);
    fromGame({ data: buffer(WEBM_BYTES) });
    advance(FILE_EXPORT_PROMPT_MS);

    vi.mocked(Date.now).mockImplementation(() => 30_000);
    fromGame({ data: 'not a video' });

    expect(toGame).toEqual([PENDING, REFUSED, PENDING, REFUSED, REFUSED]);
    expect(steps).toEqual(['requested', 'dismissed', 'rejected']);
    expect(downloads).toEqual([]);
  });

  it('refuses a video while a photo prompt is up, and the reverse', () => {
    const fromGame = mount();
    const gameWindow = container.querySelector('iframe')!.contentWindow as Window;
    const photo = { ...envelope, t: 'image:export', id: 9, data: 'data:image/png;base64,iVBORw0KGgoAAAAN' };
    act(() => {
      window.dispatchEvent(documentMessage('message', { data: photo, source: gameWindow, origin: 'null' }));
    });
    fromGame({ data: buffer(MP4_BYTES) });

    expect(promptText()).toContain('photo');
    expect(document.querySelectorAll('.image-export-prompt')).toHaveLength(1);
    expect(toGame).toContainEqual(REFUSED);

    act(() => dismissButton()!.click());
    vi.mocked(Date.now).mockImplementation(() => 20_000);
    fromGame({ data: buffer(MP4_BYTES) });
    expect(promptText()).toContain('video clip');
  });

  it('is wired into GameFrame, which every play surface renders', async () => {
    root = createRoot(container);
    act(() => root!.render(<GameFrame title="game" html="<!doctype html><p>game</p>" autoFocus={false} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const fromGame = attach(container.querySelector('iframe') as HTMLIFrameElement);

    fromGame({ name: 'From Frame', data: buffer(WEBM_BYTES) });

    expect(promptText()).toBe('This game wants to save a video clip: from-frame.webm');
    expect(toGame).toEqual([PENDING]);
  });
});
