// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { LocalActivityStatus } from './LocalActivityStatus.js';
import {
  LOCAL_ACTIVITY_FAST_MS,
  LOCAL_ACTIVITY_IDLE_AFTER,
  LOCAL_ACTIVITY_IDLE_MS,
  nextLocalActivityDelay,
} from './localActivityPoll.js';
it('shows local progress, lost contact and a completed task distinctly', async () => {
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  const root = createRoot(host);
  const activity = { runId: 'run', agent: 'agy', phase: 'editing', at: new Date().toISOString() };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ activity: { ...activity } }) })),
  );
  try {
    await act(async () => root.render(createElement(LocalActivityStatus, { token: 'one', key: 'one' })));
    expect(host.textContent).toContain('editing locally');
    activity.at = new Date(Date.now() - 60_000).toISOString();
    await act(async () => root.render(createElement(LocalActivityStatus, { token: 'two', key: 'two' })));
    expect(host.textContent).toContain('Contact with the CLI was lost');
    activity.phase = 'ready';
    await act(async () => root.render(createElement(LocalActivityStatus, { token: 'three', key: 'three' })));
    expect(host.textContent).toContain('Ready to send with /submit');
    expect(host.textContent).not.toContain('Contact with the CLI was lost');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

// An unattended guide used to poll every ten seconds forever.
describe('nextLocalActivityDelay', () => {
  const live = { runId: 'r', agent: 'agy', phase: 'editing', at: '2026-09-09T10:00:00Z' } as const;

  it('keeps the fast cadence while a task is running', () => {
    expect(nextLocalActivityDelay({ ...live }, 0)).toBe(LOCAL_ACTIVITY_FAST_MS);
  });

  it('stays fast for the first empty polls, so a slow start is still caught', () => {
    expect(nextLocalActivityDelay(null, 0)).toBe(LOCAL_ACTIVITY_FAST_MS);
    expect(nextLocalActivityDelay(null, LOCAL_ACTIVITY_IDLE_AFTER - 1)).toBe(LOCAL_ACTIVITY_FAST_MS);
  });

  it('widens once nothing has been happening', () => {
    expect(nextLocalActivityDelay(null, LOCAL_ACTIVITY_IDLE_AFTER)).toBe(LOCAL_ACTIVITY_IDLE_MS);
  });

  // Slowly, not never: the next task appears in the same guide.
  it('widens after a finished task rather than stopping', () => {
    for (const phase of ['ready', 'failed', 'stopped']) {
      expect(nextLocalActivityDelay({ ...live, phase } as typeof live, 0)).toBe(LOCAL_ACTIVITY_IDLE_MS);
    }
  });
});

it('asks nothing while the tab is hidden, and asks at once when it comes back', async () => {
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  const root = createRoot(host);
  const fetched = vi.fn(async () => ({ ok: true, json: async () => ({ activity: null }) }));
  vi.stubGlobal('fetch', fetched);
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  try {
    await act(async () => root.render(createElement(LocalActivityStatus, { token: 'hidden-tab' })));
    expect(fetched).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetched).toHaveBeenCalledTimes(1);
  } finally {
    visibility.mockRestore();
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
