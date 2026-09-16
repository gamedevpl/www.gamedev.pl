import { expect, it, vi, beforeEach } from 'vitest';
import { createSessionController } from './session-controller.js';
import { sessionBrowserHost } from './session-browser-host.js';
import { startSessionBrowser } from './session-browser-server.js';
import { openUrl } from './open-url.js';
vi.mock('./session-browser-server.js', () => ({ startSessionBrowser: vi.fn() }));
vi.mock('./open-url.js', () => ({ openUrl: vi.fn(async () => true) }));
beforeEach(() => vi.clearAllMocks());

it('opens one shared panel only for previews registered by the CLI', async () => {
  const session = createSessionController('');
  const host = sessionBrowserHost(session);
  const server = { url: 'http://127.0.0.1:2/#token', setPreview: vi.fn(), clearPreview: vi.fn(), close: vi.fn() };
  vi.mocked(startSessionBrowser).mockResolvedValue(server);
  const preview = 'http://127.0.0.1:1/preview/';
  session.writeLine(`local live preview: ${preview}`);
  await host.open(preview);
  expect(startSessionBrowser).not.toHaveBeenCalled();
  host.registerPreview(preview);
  await Promise.all([host.open(preview), host.open(preview)]);
  expect(startSessionBrowser).toHaveBeenCalledOnce();
  expect(openUrl).toHaveBeenLastCalledWith(server.url);
  session.clearPreview();
  await Promise.resolve();
  expect(server.clearPreview).toHaveBeenCalledOnce();
  await host.close();
  expect(server.close).toHaveBeenCalledOnce();
  session.close();
});

it('closes a listener that finishes starting after the terminal closes', async () => {
  const session = createSessionController('');
  const host = sessionBrowserHost(session);
  const server = { url: 'http://127.0.0.1:2/#token', setPreview: vi.fn(), clearPreview: vi.fn(), close: vi.fn() };
  let ready!: (value: typeof server) => void;
  vi.mocked(startSessionBrowser).mockImplementation(
    () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
  );
  host.registerPreview('http://127.0.0.1:1/preview/');
  const opening = host.open('http://127.0.0.1:1/preview/');
  const closing = host.close();
  ready(server);
  expect(await opening).toBe(false);
  await closing;
  expect(openUrl).not.toHaveBeenCalled();
  expect(server.close).toHaveBeenCalledOnce();
  session.close();
});
