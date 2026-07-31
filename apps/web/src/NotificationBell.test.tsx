// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { notificationPanelShiftX } from './notificationPanelPosition.js';

/**
 * The weekly digest is the only notification nobody asked for on the day it arrives, so
 * the switch that stops it has to be reachable from the app — not only from a link inside
 * the email. Someone who reads the digest in this bell had no way to say "stop", and
 * anyone who unsubscribed had no way back. These tests are about that switch existing and
 * meaning what it says.
 */

const fetchNotifications = vi.fn();
const fetchNotificationPreferences = vi.fn();
const updateNotificationPreferences = vi.fn();
let authUser: { uid: string; name: string } | null = null;

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: authUser, logout: vi.fn() }),
}));

vi.mock('./pushApi', () => ({
  pushUiState: async () => ({ show: false, subscribed: false, permission: 'default' }),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

vi.mock('./notificationsApi', async () => {
  const actual = await vi.importActual<typeof import('./notificationsApi.js')>('./notificationsApi.js');
  return {
    ...actual,
    fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
    fetchNotificationPreferences: () => fetchNotificationPreferences(),
    updateNotificationPreferences: (...args: unknown[]) => updateNotificationPreferences(...args),
    markNotificationsRead: vi.fn(),
    clearNotifications: vi.fn(),
  };
});

const { NotificationBell } = await import('./NotificationBell.js');

async function openBell() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(NotificationBell));
  });

  const trigger = container.querySelector('button');
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });

  return { container, root };
}

function toggleIn(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Weekly summary'),
  ) as HTMLButtonElement | undefined;
}

describe('NotificationBell — weekly digest switch', () => {
  beforeEach(() => {
    authUser = { uid: 'g:creator', name: 'Creator' };
    fetchNotifications.mockReset();
    fetchNotifications.mockResolvedValue([]);
    fetchNotificationPreferences.mockReset();
    fetchNotificationPreferences.mockResolvedValue({ digest: true, email: true });
    updateNotificationPreferences.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the digest as on for someone who has not opted out', async () => {
    const { container, root } = await openBell();

    expect(toggleIn(container)?.textContent).toContain('Weekly summary on');
    root.unmount();
  });

  it('turns the digest off from inside the app', async () => {
    updateNotificationPreferences.mockResolvedValue({ digest: false, email: true });

    const { container, root } = await openBell();
    await act(async () => {
      toggleIn(container)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(updateNotificationPreferences).toHaveBeenCalledWith({ digest: false });
    expect(toggleIn(container)?.textContent).toContain('Weekly summary off');
    root.unmount();
  });

  it('turns it back on again', async () => {
    // An opt-out with no matching opt-in is a decision a person cannot revise.
    fetchNotificationPreferences.mockResolvedValue({ digest: false, email: true });
    updateNotificationPreferences.mockResolvedValue({ digest: true, email: true });

    const { container, root } = await openBell();
    expect(toggleIn(container)?.textContent).toContain('Weekly summary off');

    await act(async () => {
      toggleIn(container)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(updateNotificationPreferences).toHaveBeenCalledWith({ digest: true });
    expect(toggleIn(container)?.textContent).toContain('Weekly summary on');
    root.unmount();
  });

  it('keeps showing the previous value when the update fails', async () => {
    // Showing "off" for a change the server never accepted would tell someone they had
    // stopped the digest when they had not.
    updateNotificationPreferences.mockRejectedValue(new Error('offline'));

    const { container, root } = await openBell();
    await act(async () => {
      toggleIn(container)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(toggleIn(container)?.textContent).toContain('Weekly summary on');
    root.unmount();
  });

  it('still lists notifications when preferences cannot be read', async () => {
    fetchNotificationPreferences.mockRejectedValue(new Error('offline'));
    fetchNotifications.mockResolvedValue([
      {
        id: 'digest-2026-W31',
        type: 'creator.digest',
        createdAt: '2026-07-28T09:00:00.000Z',
        readAt: null,
        titleKey: 'notifications.creator.digest.title',
        bodyKey: 'notifications.creator.digest.body',
        params: { games: '2', sessions: '30', votesUp: '4', votesDown: '1', feedback: '3' },
        link: '/',
      },
    ]);

    const { container, root } = await openBell();

    expect(toggleIn(container)).toBeUndefined();
    // The digest itself renders — the bell is the surface that shows it regardless.
    expect(container.textContent).toContain('Your games this week');
    root.unmount();
  });
});

describe('notificationPanelShiftX', () => {
  it('shifts a panel right when it overflows the left edge', () => {
    expect(notificationPanelShiftX({ left: -9, right: 311 }, 375)).toBe(21);
  });

  it('shifts a panel left when it overflows the right edge', () => {
    expect(notificationPanelShiftX({ left: 100, right: 420 }, 400)).toBe(-32);
  });

  it('leaves a panel in place when it fits within the viewport gutters', () => {
    expect(notificationPanelShiftX({ left: 40, right: 360 }, 400)).toBe(0);
  });
});
