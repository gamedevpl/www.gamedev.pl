// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function navigate(destination: string) {
  const listeners = new Map<string, (event: unknown) => void>();
  runInNewContext(source, {
    URL,
    Response,
    fetch: vi.fn(),
    self: {
      location: { origin: 'https://example.test' },
      addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    },
  });
  const respondWith = vi.fn();
  // Node's Request refuses mode 'navigate'; a plain object stands in.
  const request = { method: 'GET', mode: 'navigate', destination, url: 'https://example.test/play/rainbow-surfer' };
  listeners.get('fetch')!({ request, respondWith, waitUntil: () => {} });
  return respondWith;
}

describe('framed navigations', () => {
  it.each(['iframe', 'frame'])('leave %s navigations to the network and its frame headers', (destination) => {
    expect(navigate(destination)).not.toHaveBeenCalled();
  });

  it('still answers top-level navigations itself', () => {
    expect(navigate('document')).toHaveBeenCalledTimes(1);
  });
});
