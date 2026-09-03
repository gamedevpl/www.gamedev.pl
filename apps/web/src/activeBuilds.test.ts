// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActiveBuildCount } from './activeBuilds.js';
import { fetchActiveBuildCount } from './submissionApi.js';

const mockedCount = vi.hoisted(() => vi.fn());
let authUser: { uid: string; name: string } | null = null;

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: authUser, logout: vi.fn() }),
}));

vi.mock('./submissionApi', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi.js')>('./submissionApi.js');
  return { ...actual, fetchActiveBuildCount: mockedCount };
});

/** Renders the hook and reports what it returned. */
async function renderCount() {
  const seen: number[] = [];
  function Probe() {
    seen.push(useActiveBuildCount());
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Probe));
  });
  await act(async () => {
    // The hook swallows a failed poll; the helper has to as well to observe it.
    await Promise.resolve(mockedCount.mock.results[0]?.value).catch(() => undefined);
  });
  return { latest: () => seen[seen.length - 1]!, root };
}

describe('useActiveBuildCount', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    authUser = { uid: 'g:creator', name: 'Creator' };
    mockedCount.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('shows the count the server derived, without reading the whole shelf', async () => {
    mockedCount.mockResolvedValue(3);

    const { latest, root } = await renderCount();

    expect(latest()).toBe(3);

    root.unmount();
  });

  it('asks the server rather than this device, so a signed-out visitor counts nothing', async () => {
    authUser = null;
    mockedCount.mockResolvedValue(1);

    const { latest, root } = await renderCount();

    expect(latest()).toBe(0);
    expect(fetchActiveBuildCount).not.toHaveBeenCalled();

    root.unmount();
  });

  it('keeps the last known count when a poll fails — a badge is not worth an error state', async () => {
    mockedCount.mockRejectedValue(new Error('offline'));

    const { latest, root } = await renderCount();

    expect(latest()).toBe(0);

    root.unmount();
  });

  it('does not poll at all when it mounts in a background tab', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    mockedCount.mockResolvedValue(2);

    const { root } = await renderCount();
    expect(mockedCount).not.toHaveBeenCalled();

    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mockedCount).toHaveBeenCalledTimes(1);

    root.unmount();
  });

  it('skips the poll while the tab is hidden, and catches up when it comes back', async () => {
    mockedCount.mockResolvedValue(2);
    const { root } = await renderCount();
    expect(mockedCount).toHaveBeenCalledTimes(1);

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mockedCount).toHaveBeenCalledTimes(1);

    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mockedCount).toHaveBeenCalledTimes(2);

    root.unmount();
  });
});
