// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActiveBuildCount } from './activeBuilds.js';
import { listMySubmissions } from './submissionApi.js';

const mockedList = vi.hoisted(() => vi.fn());
let authUser: { uid: string; name: string } | null = null;

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: authUser, logout: vi.fn() }),
}));

vi.mock('./submissionApi', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi.js')>('./submissionApi.js');
  return { ...actual, listMySubmissions: mockedList };
});

function submission(token: string, lastKnownStatus: string | null) {
  return { token, title: token, createdAt: new Date().toISOString(), lastKnownStatus, slug: null };
}

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
    await Promise.resolve(mockedList.mock.results[0]?.value).catch(() => undefined);
  });
  return { latest: () => seen[seen.length - 1]!, root };
}

describe('useActiveBuildCount', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    authUser = { uid: 'g:creator', name: 'Creator' };
    mockedList.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('counts only builds still in flight, not everything the creator ever made', async () => {
    mockedList.mockResolvedValue([
      submission('a', 'queued'),
      submission('b', 'building'),
      submission('c', 'published'),
      submission('d', 'needs_changes'),
      // Just submitted: the sweep has not derived a status yet. Still in flight —
      // dropping it would blank the badge for the first two minutes.
      submission('e', null),
    ]);

    const { latest, root } = await renderCount();

    expect(latest()).toBe(3);

    root.unmount();
  });

  it('asks the server rather than this device, so a signed-out visitor counts nothing', async () => {
    authUser = null;
    mockedList.mockResolvedValue([submission('a', 'building')]);

    const { latest, root } = await renderCount();

    expect(latest()).toBe(0);
    expect(listMySubmissions).not.toHaveBeenCalled();

    root.unmount();
  });

  it('keeps the last known count when a poll fails — a badge is not worth an error state', async () => {
    mockedList.mockRejectedValue(new Error('offline'));

    const { latest, root } = await renderCount();

    expect(latest()).toBe(0);

    root.unmount();
  });
});
