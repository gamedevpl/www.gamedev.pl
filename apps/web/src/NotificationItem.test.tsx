// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import i18n from './i18n/index.js';
import { NotificationItem } from './NotificationItem.js';
import type { AppNotification } from './notificationsApi.js';

function notice(type: string, link: string): AppNotification {
  return {
    id: type,
    type,
    createdAt: '2026-07-28T09:00:00.000Z',
    readAt: null,
    titleKey: `notifications.${type}.title`,
    bodyKey: `notifications.${type}.body`,
    params: { title: 'Demo' },
    link,
  } as never;
}

describe('NotificationItem', () => {
  it('renders operator alerts as plain text, not links', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const container = document.createElement('ul');
    const root = createRoot(container);
    const items = [notice('operator.build_failed', '/admin/jobs/1'), notice('submission.building', '/studio/demo')];
    await act(async () => {
      root.render(
        items.map((n) => createElement(NotificationItem, { key: n.id, n, onNavigate: () => {}, onDismiss: () => {} })),
      );
    });

    const hrefs = [...container.querySelectorAll('a.notif-link')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/studio/demo']);
    expect(container.querySelectorAll('.notif-link.is-static')).toHaveLength(1);
    act(() => root.unmount());
  });
});
