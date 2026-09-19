import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { captureBrowser } from './local-capture-browser.js';

vi.mock('node:fs', async (original) => ({ ...(await original<object>()), existsSync: () => true }));
vi.mock('node:child_process', () => ({
  spawn: () => {
    const child = new EventEmitter();
    const writer = new PassThrough();
    const reader = new PassThrough();
    const enabled = new Set<string>();
    const emit = (value: unknown) => reader.write(JSON.stringify(value) + '\0');
    writer.on('data', (raw: Buffer) => {
      const message = JSON.parse(raw.toString().replace(/\0$/, ''));
      const { id, method, sessionId } = message;
      if (method === 'Runtime.enable' || method === 'Log.enable') enabled.add(`${sessionId}:${method}`);
      if (method === 'Page.navigate') {
        emit({ method: 'Target.attachedToTarget', params: { sessionId: 'game', targetInfo: { type: 'iframe' } } });
      }
      if (method === 'Runtime.runIfWaitingForDebugger' && sessionId === 'game') {
        if (enabled.has('game:Log.enable')) {
          emit({ method: 'Log.entryAdded', params: { entry: { level: 'error', text: 'CSP blocked image' } } });
          emit({ method: 'Log.entryAdded', params: { entry: { level: 'info', text: 'ignore me' } } });
        }
        if (enabled.has('game:Runtime.enable')) {
          emit({ method: 'Runtime.exceptionThrown', params: { exceptionDetails: { text: 'game failed' } } });
        }
      }
      const result =
        method === 'Target.createTarget'
          ? { targetId: 'page' }
          : method === 'Target.attachToTarget'
            ? { sessionId: 'page' }
            : method === 'Page.captureScreenshot'
              ? { data: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64') }
              : {};
      queueMicrotask(() => emit({ id, result }));
    });
    return Object.assign(child, {
      stdio: [null, null, new PassThrough(), writer, reader],
      stderr: new PassThrough(),
      exitCode: null,
      signalCode: null,
      kill() {
        this.signalCode = 'SIGTERM';
        this.emit('exit');
        this.emit('close');
      },
    });
  },
}));
it('collects browser and runtime errors from the isolated game frame before capture', async () => {
  const result = await captureBrowser({
    url: 'http://127.0.0.1:12345/fixed-capture',
    viewport: 'desktop',
    signal: AbortSignal.timeout(5000),
  });
  expect(result.errors).toHaveLength(2);
  expect(result.errors.join(' ')).toContain('CSP blocked image');
  expect(result.errors.join(' ')).toContain('game failed');
  expect(result.errors.join(' ')).not.toContain('ignore me');
});
