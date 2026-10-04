// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSharedTune } from './useSharedTune.js';

let container: HTMLDivElement;
let root: Root | null = null;
let seen: unknown = undefined;

function Probe(props: { slug: string; enabled: boolean }) {
  const [params] = useSharedTune(props.slug, props.enabled);
  seen = params;
  return null;
}

async function draw(enabled = true) {
  root = createRoot(container);
  await act(async () => {
    root!.render(<Probe slug="dog-dash" enabled={enabled} />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  seen = undefined;
  window.history.replaceState(null, '', '/play/dog-dash?remix=v1.signed-code');
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('useSharedTune', () => {
  it('asks the server to vouch for the code and applies what it returns', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ params: { dogScale: 2, night: true } })));
    vi.stubGlobal('fetch', fetchMock);
    await draw();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/games/dog-dash/shared-tune?code=v1.signed-code',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(seen).toEqual({ dogScale: 2, night: true });
  });

  it.each([
    [400, 'invalid_share'],
    [403, 'remix_off'],
  ])('plays the normal game when the server answers %i %s', async (status, error) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error }), { status })));
    await draw();
    expect(seen).toBeNull();
  });

  it('never decodes the code itself, and asks nothing when remix is not offered', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await draw(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seen).toBeNull();
  });
});
