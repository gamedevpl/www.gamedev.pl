// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { embedGameHtml } from './gamePlayer.js';

const BRIDGE_SOURCE = (() => {
  const html = embedGameHtml('<html><head></head><body></body></html>');
  const startMarker = '<script>';
  const endMarker = '</script>';
  const start = html.indexOf(startMarker);
  const end = start < 0 ? -1 : html.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error('embedGameHtml stopped injecting a script');
  return html.slice(start + startMarker.length, end);
})();

function runBridge(prepare: (frameWindow: Window & typeof globalThis) => void) {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const frameWindow = frame.contentWindow as (Window & typeof globalThis) | null;
  if (!frameWindow) throw new Error('no iframe realm');
  prepare(frameWindow);
  new frameWindow.Function(BRIDGE_SOURCE)();
  return {
    frameWindow,
    stop: () => frame.remove(),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('iOS audio unlock in the player bridge', () => {
  it('selects playback and starts a buffer without a media element', () => {
    const session = { type: 'auto' };
    const started: number[] = [];
    class FakeAudioContext {
      state = 'suspended';
      destination = {};
      sampleRate: number;
      constructor(options?: { sampleRate?: number }) {
        this.sampleRate = options?.sampleRate ?? 48000;
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      createBuffer() {
        return {};
      }
      createBufferSource() {
        return {
          buffer: null as unknown,
          connect() {
            return undefined;
          },
          start() {
            started.push(1);
          },
        };
      }
    }
    const bridge = runBridge((frameWindow) => {
      Object.defineProperty(frameWindow.navigator, 'audioSession', { configurable: true, value: session });
      Object.defineProperty(frameWindow, 'AudioContext', {
        configurable: true,
        writable: true,
        value: FakeAudioContext,
      });
      Object.defineProperty(frameWindow, 'webkitAudioContext', {
        configurable: true,
        writable: true,
        value: FakeAudioContext,
      });
    });
    expect(session.type).toBe('playback');
    const Ctx = bridge.frameWindow.AudioContext as unknown as typeof FakeAudioContext;
    const ctx = new Ctx({ sampleRate: 22050 });
    expect(ctx.sampleRate).toBe(22050);
    expect(ctx.state).toBe('running');
    expect(started).toHaveLength(1);
    bridge.frameWindow.dispatchEvent(new bridge.frameWindow.PointerEvent('pointerdown', { bubbles: true }));
    expect(bridge.frameWindow.document.querySelector('audio')).toBeNull();
    bridge.stop();
  });

  it('starts the silent buffer when resume settles, without a second gesture', async () => {
    const started: number[] = [];
    class SlowContext {
      state = 'suspended';
      destination = {};
      release: (() => void) | null = null;
      resume() {
        return new Promise<void>((resolve) => {
          this.release = () => {
            this.state = 'running';
            resolve();
          };
        });
      }
      createBuffer() {
        return {};
      }
      createBufferSource() {
        return {
          buffer: null as unknown,
          connect() {
            return undefined;
          },
          start() {
            started.push(1);
          },
        };
      }
    }
    const bridge = runBridge((frameWindow) => {
      Object.defineProperty(frameWindow.navigator, 'audioSession', {
        configurable: true,
        value: { type: 'playback' },
      });
      Object.defineProperty(frameWindow, 'AudioContext', { configurable: true, writable: true, value: SlowContext });
    });
    const Ctx = bridge.frameWindow.AudioContext as unknown as typeof SlowContext;
    const ctx = new Ctx();
    expect(started).toHaveLength(0);
    ctx.release?.();
    await Promise.resolve();
    expect(started).toHaveLength(1);
    bridge.frameWindow.dispatchEvent(new bridge.frameWindow.Event('touchend'));
    expect(started).toHaveLength(1);
    expect(bridge.frameWindow.document.querySelector('audio')).toBeNull();
    bridge.stop();
  });

  it('loops silent media only without audioSession and drops it on pause or hide', () => {
    const bridge = runBridge(() => undefined);
    const frameWindow = bridge.frameWindow;
    frameWindow.dispatchEvent(new frameWindow.PointerEvent('pointerdown', { bubbles: true }));
    const audio = frameWindow.document.querySelector('audio');
    expect(audio?.getAttribute('src')?.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(audio?.loop).toBe(true);
    frameWindow.dispatchEvent(
      new frameWindow.MessageEvent('message', { data: { source: 'gdpl-host', type: 'pause' } }),
    );
    expect(frameWindow.document.querySelector('audio')).toBeNull();
    frameWindow.dispatchEvent(
      new frameWindow.MessageEvent('message', { data: { source: 'gdpl-host', type: 'resume' } }),
    );
    expect(frameWindow.document.querySelector('audio')).toBeNull();
    frameWindow.dispatchEvent(new frameWindow.PointerEvent('pointerdown', { bubbles: true }));
    expect(frameWindow.document.querySelector('audio')).not.toBeNull();
    Object.defineProperty(frameWindow.document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    frameWindow.document.dispatchEvent(new frameWindow.Event('visibilitychange'));
    expect(frameWindow.document.querySelector('audio')).toBeNull();
    bridge.stop();
  });
});
