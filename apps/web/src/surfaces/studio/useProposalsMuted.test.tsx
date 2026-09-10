// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchNotificationPreferences = vi.fn();
const updateNotificationPreferences = vi.fn();
const onNotificationPreferencesChanged = vi.fn(() => () => {});

vi.mock('../../notificationsApi.js', () => ({
  fetchNotificationPreferences,
  updateNotificationPreferences,
  onNotificationPreferencesChanged,
}));

const { PROPOSAL_PREFS_RETRY_MS, useProposalsMuted } = await import('./useProposalsMuted.js');

let seen: (boolean | null)[] = [];

function Host({ onScreen }: { onScreen: boolean }) {
  const prefs = useProposalsMuted(onScreen);
  seen.push(prefs.muted);
  return null;
}

async function mount(onScreen = true) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<Host onScreen={onScreen} />);
  });
  return root;
}

describe('useProposalsMuted', () => {
  beforeEach(() => {
    seen = [];
    vi.useFakeTimers();
    fetchNotificationPreferences.mockReset();
    updateNotificationPreferences.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('waits for the answer before saying anything about the mute', async () => {
    fetchNotificationPreferences.mockResolvedValue({ proposals: false });
    await mount();

    expect(seen[0]).toBeNull();
    expect(seen.at(-1)).toBe(true);
  });

  it('asks nothing while no proposal is on screen', async () => {
    fetchNotificationPreferences.mockResolvedValue({ proposals: true });
    await mount(false);

    expect(fetchNotificationPreferences).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBeNull();
  });

  it('tries again after a failed read, instead of hiding the card for the whole mount', async () => {
    fetchNotificationPreferences.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ proposals: true });
    await mount();

    expect(seen.at(-1)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROPOSAL_PREFS_RETRY_MS);
    });

    expect(fetchNotificationPreferences).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toBe(false);
  });

  it('gives up rather than polling a dead endpoint', async () => {
    fetchNotificationPreferences.mockRejectedValue(new Error('offline'));
    await mount();
    for (let round = 0; round < 6; round += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PROPOSAL_PREFS_RETRY_MS);
      });
    }

    expect(fetchNotificationPreferences).toHaveBeenCalledTimes(3);
    expect(seen.at(-1)).toBeNull();
  });
});
