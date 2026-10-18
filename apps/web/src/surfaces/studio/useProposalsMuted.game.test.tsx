// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchNotificationPreferences = vi.fn();
const updateNotificationPreferences = vi.fn();
const fetchGameDreams = vi.fn();
const setGameDreams = vi.fn();
let gameListener: ((slug: string, dreams: { on: boolean; accountMuted: boolean }) => void) | undefined;

vi.mock('../../notificationsApi.js', () => ({
  fetchNotificationPreferences,
  updateNotificationPreferences,
  onNotificationPreferencesChanged: () => () => {},
}));
vi.mock('../../gameDreamsApi.js', () => ({
  fetchGameDreams,
  setGameDreams,
  onGameDreamsChanged: (listener: typeof gameListener) => {
    gameListener = listener;
    return () => {};
  },
}));

const { useProposalsMuted } = await import('./useProposalsMuted.js');

let latest: ReturnType<typeof useProposalsMuted> | undefined;

function Host() {
  latest = useProposalsMuted(true, 'neon');
  return null;
}

async function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(<Host />);
  });
}

describe('useProposalsMuted with a game', () => {
  beforeEach(() => {
    latest = undefined;
    gameListener = undefined;
    fetchNotificationPreferences.mockReset().mockResolvedValue({ proposals: true });
    updateNotificationPreferences.mockReset().mockResolvedValue({});
    fetchGameDreams.mockReset();
    setGameDreams.mockReset().mockResolvedValue({ on: false, accountMuted: false });
  });

  afterEach(() => vi.clearAllMocks());

  it('mutes the card when only this game is switched off', async () => {
    fetchGameDreams.mockResolvedValue({ on: false, accountMuted: false });
    await mount();
    expect(fetchGameDreams).toHaveBeenCalledWith('neon');
    expect(latest?.muted).toBe(true);
  });

  it('turns off this game, not the account, when the card mutes', async () => {
    fetchGameDreams.mockResolvedValue({ on: true, accountMuted: false });
    await mount();
    expect(latest?.muted).toBe(false);
    expect(latest?.canMute).toBe(true);
    await act(async () => latest!.mute());
    expect(setGameDreams).toHaveBeenCalledWith('neon', false);
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
    expect(latest?.muted).toBe(true);
  });

  it('puts the card back when the write fails', async () => {
    fetchGameDreams.mockResolvedValue({ on: true, accountMuted: false });
    setGameDreams.mockRejectedValue(new Error('offline'));
    await mount();
    await act(async () => latest!.mute());
    expect(latest?.muted).toBe(false);
  });

  it("treats a game that is not the viewer's as switched on, and offers no switch", async () => {
    fetchGameDreams.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
    await mount();
    expect(latest?.muted).toBe(false);
    expect(latest?.canMute).toBe(false);
  });

  it('follows the rail switch without a reload', async () => {
    fetchGameDreams.mockResolvedValue({ on: false, accountMuted: false });
    await mount();
    expect(latest?.muted).toBe(true);
    await act(async () => gameListener?.('neon', { on: true, accountMuted: false }));
    expect(latest?.muted).toBe(false);
    await act(async () => gameListener?.('other', { on: false, accountMuted: false }));
    expect(latest?.muted).toBe(false);
  });
});
