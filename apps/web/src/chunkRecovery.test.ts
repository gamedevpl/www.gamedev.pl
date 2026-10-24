// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchChunkRecovery } from './chunkRecovery.js';

const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')!;
let stop: () => void;
let reload: ReturnType<typeof vi.fn>;
const BUILD_A = 'https://example.test/assets/index-a.js';
const BUILD_B = 'https://example.test/assets/index-b.js';

function failImport(message = 'Failed to fetch dynamically imported module: /assets/App-old.js') {
  window.dispatchEvent(Object.assign(new Event('vite:preloadError'), { payload: new TypeError(message) }));
}

beforeEach(() => {
  sessionStorage.clear();
  reload = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response('<script src="/assets/index-b.js"></script>', {
          headers: { 'content-type': 'text/html' },
        }),
    ),
  );
  stop = watchChunkRecovery(BUILD_A);
});

afterEach(() => {
  stop();
  Object.defineProperty(window, 'location', locationDescriptor);
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('chunk recovery', () => {
  it('removes cached shell documents before reloading, preserving assets and unrelated caches', async () => {
    const oldShell = new Map([
      ['/index.html', 'old HTML'],
      ['/assets/index-old.js', 'old JS'],
    ]);
    const newShell = new Map([['/index.html', 'new HTML']]);
    const cacheContents = new Map([
      ['gamedevpl-shell-old', oldShell],
      ['gamedevpl-shell-new', newShell],
      ['unrelated', new Map([['/index.html', 'other HTML']])],
    ]);
    const open = vi.fn(async (name: string) => ({
      delete: async (key: string) => cacheContents.get(name)!.delete(key),
    }));
    vi.stubGlobal('caches', { keys: async () => [...cacheContents.keys()], open });
    reload.mockImplementation(() => {
      expect(oldShell.has('/index.html')).toBe(false);
      expect(newShell.has('/index.html')).toBe(false);
    });

    failImport();
    failImport();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());

    expect(fetch).toHaveBeenCalledWith('/', expect.objectContaining({ cache: 'reload' }));

    expect(oldShell.has('/assets/index-old.js')).toBe(true);
    expect(cacheContents.get('unrelated')!.has('/index.html')).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('keeps the guard across page boots and allows recovery after another deploy', async () => {
    failImport();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    stop();
    stop = watchChunkRecovery(BUILD_A);
    failImport();
    expect(reload).toHaveBeenCalledOnce();

    stop();
    stop = watchChunkRecovery(BUILD_B);
    failImport();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2));

    stop();
    stop = watchChunkRecovery(BUILD_A);
    failImport();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it.each([
    'error loading dynamically imported module: /assets/en-old.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/App-old.css',
  ])('recognizes browser import failures: %s', async (message) => {
    failImport(message);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });

  it('reloads when Cache Storage is blocked', async () => {
    vi.stubGlobal('caches', {
      keys: async () => {
        throw new Error('blocked');
      },
    });
    failImport();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });

  it('preserves the offline shell when a transient failure needs the same build', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('<script src="/assets/index-a.js"></script>', {
        headers: { 'content-type': 'text/html' },
      }),
    );
    const open = vi.fn();
    vi.stubGlobal('caches', { keys: vi.fn(), open });
    failImport();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(open).not.toHaveBeenCalled();
  });

  it.each([503, 404])('keeps manual recovery when the fresh document returns %s', async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response('unavailable', { status }));
    failImport();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps manual recovery when the network probe fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    failImport();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(reload).not.toHaveBeenCalled();
  });

  it('leaves offline failures and module evaluation bugs to the existing fallback', () => {
    failImport('Cannot read properties of undefined');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    failImport();
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it('does not risk a reload loop when session storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    failImport();
    expect(reload).not.toHaveBeenCalled();
  });
});
