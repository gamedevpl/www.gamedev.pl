// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { embedGameHtml } from '@gamedevpl/contract';

type Realm = Window & typeof globalThis & { __GAME_HARNESS__: { frame: number; metadata: { state: string } } };

function monitor() {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const win = frame.contentWindow as Realm;
  const canvas = win.document.createElement('canvas');
  canvas.width = 1170;
  canvas.height = 2532;
  win.document.body.append(canvas);
  canvas.getBoundingClientRect = () => ({ width: 390, height: 844 }) as DOMRect;
  Object.defineProperty(win.document, 'visibilityState', { value: 'visible', configurable: true });
  Object.defineProperty(win, 'devicePixelRatio', { value: 3, configurable: true });
  win.__GAME_HARNESS__ = { frame: 0, metadata: { state: 'playing' } };
  let now = 0;
  const callbacks: FrameRequestCallback[] = [];
  const timers: Array<() => void> = [];
  const sent: Array<Record<string, unknown>> = [];
  win.performance.now = () => now;
  win.requestAnimationFrame = (cb) => {
    callbacks.push(cb);
    return callbacks.length;
  };
  win.setInterval = ((cb: () => void) => {
    timers.push(cb);
    return timers.length;
  }) as typeof win.setInterval;
  Object.defineProperty(win, '__GDPL_DOCUMENT_SEND__', { value: (m: Record<string, unknown>) => sent.push(m) });
  const html = embedGameHtml('<html><head></head><body></body></html>');
  const start = html.indexOf('<script>') + '<script>'.length;
  new win.Function(html.slice(start, html.indexOf('</script>', start)))();
  const active = (value: boolean) =>
    win.dispatchEvent(
      new win.MessageEvent('message', {
        source: win.parent,
        data: { source: 'gdpl-host', type: 'telemetry', active: value },
      }),
    );
  const step = (ms: number, render = true) => {
    now += ms;
    if (render) win.__GAME_HARNESS__.frame++;
    const cb = callbacks.shift();
    cb?.(now);
  };
  const flush = () => {
    timers[0]();
    return sent.filter((m) => m.type === 'alive').at(-1) as {
      frames: number;
      performance: {
        valid: boolean;
        intervals: number[];
        elapsedMs: number;
        maxGapMs: number;
        renderedFrames?: number;
        canvasWidth: number;
        canvasCssWidth: number;
        dpr: number;
      };
    };
  };
  return { win, canvas, active, step, flush };
}

afterEach(() => {
  document.body.innerHTML = '';
});
describe('executed frame monitor', () => {
  it('measures elapsed time and stutters independently of presented frame count', () => {
    const m = monitor();
    m.active(true);
    m.step(5000);
    expect(m.flush().performance.valid).toBe(false);
    m.step(17);
    m.step(17);
    m.step(400, false);
    const tick = m.flush();
    expect(tick.frames).toBe(3);
    expect(tick.performance).toMatchObject({
      valid: true,
      elapsedMs: 434,
      maxGapMs: 400,
      renderedFrames: 2,
      canvasWidth: 1170,
      canvasCssWidth: 390,
      dpr: 3,
    });
    expect(tick.performance.intervals[6]).toBe(1);
  });
  it('discards inactive, resize and resume windows', () => {
    const m = monitor();
    m.active(true);
    m.step(5000);
    m.flush();
    m.active(false);
    m.step(1000);
    expect(m.flush().performance.valid).toBe(false);
    m.active(true);
    m.step(1000);
    expect(m.flush().performance.valid).toBe(false);
    m.step(1000);
    expect(m.flush().performance.valid).toBe(true);
    m.canvas.width = 640;
    m.step(1000);
    expect(m.flush().performance.valid).toBe(false);
    m.step(1000);
    expect(m.flush().performance.valid).toBe(true);
    Object.defineProperty(m.win.document, 'visibilityState', { value: 'hidden', configurable: true });
    m.win.document.dispatchEvent(new m.win.Event('visibilitychange'));
    m.step(1000);
    expect(m.flush().performance.valid).toBe(false);
  });
});
