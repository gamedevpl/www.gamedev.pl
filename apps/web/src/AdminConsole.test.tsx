// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminConsole } from './AdminConsole.js';
import type { AdminSummary } from './adminApi.js';
import type { AdminSection } from './router.js';

const mocked = vi.hoisted(() => ({
  fetchAdminSummary: vi.fn(),
  fetchCreationLimits: vi.fn(),
  setCreationLimits: vi.fn(),
  fetchSuggestions: vi.fn(),
  fetchAccessTokens: vi.fn(),
  mintAccessToken: vi.fn(),
  revokeAccessToken: vi.fn(),
}));

vi.mock('./adminApi.js', () => mocked);
// The sections themselves are covered by their own tests; the console's job is which
// one is on screen, not what it renders.
vi.mock('./AdminJobsPanel.js', () => ({ AdminJobsPanel: () => createElement('p', null, 'queue-panel') }));
vi.mock('./GameHealthView.js', () => ({ GameHealthView: () => createElement('p', null, 'telemetry-panel') }));
vi.mock('./CostsPanel.js', () => ({ CostsPanel: () => createElement('p', null, 'costs-panel') }));
vi.mock('./CreationLimitsPanel.js', () => ({ CreationLimitsPanel: () => createElement('p', null, 'limits-panel') }));
vi.mock('./AccessTokensPanel.js', () => ({ AccessTokensPanel: () => createElement('p', null, 'tokens-panel') }));
vi.mock('./SuggestionsPanel.js', () => ({ SuggestionsPanel: () => createElement('p', null, 'suggestions-panel') }));

function summary(overrides: Partial<AdminSummary> = {}): AdminSummary {
  return {
    alerts: [],
    queue: { active: 2, stalled: 0, byState: { building: 2 } },
    limits: { paused: false, globalDailySubmissionCap: 50, todaySubmissions: 3 },
    ...overrides,
  };
}

async function render(section: AdminSection = 'queue', onNavigate = vi.fn()) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(AdminConsole, { section, onNavigate }));
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root, onNavigate };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('AdminConsole', () => {
  it('renders the section it was routed to, and only that one', async () => {
    mocked.fetchAdminSummary.mockResolvedValue(summary());

    const { container, root } = await render('limits');

    expect(container.textContent).toContain('limits-panel');
    expect(container.textContent).not.toContain('queue-panel');
    expect(container.querySelector('.admin-tab.is-active')?.textContent).toBe('Limits');

    await act(async () => root.unmount());
  });

  it('routes to the cost section, which nothing linked to before', async () => {
    mocked.fetchAdminSummary.mockResolvedValue(summary());

    const { container, root } = await render('costs');

    expect(container.textContent).toContain('costs-panel');
    expect(container.querySelector('.admin-tab.is-active')?.textContent).toBe('Cost');

    await act(async () => root.unmount());
  });

  it('tells a non-operator nothing, including that there was anything to tell', async () => {
    mocked.fetchAdminSummary.mockResolvedValue(null);

    const { container, root } = await render('queue');

    expect(container.textContent).toBe('Not found.');
    // No section is rendered at all — not even the one that would have said "not found"
    // itself a moment later.
    expect(container.textContent).not.toContain('queue-panel');

    await act(async () => root.unmount());
  });

  it('shows what is waiting on the operator, whichever section they opened', async () => {
    mocked.fetchAdminSummary.mockResolvedValue(
      summary({
        alerts: [
          {
            id: 'op-1-review_ready',
            kind: 'review_ready',
            issueNumber: 1_000_001,
            title: 'Comet Courier',
            ownerUid: 'g:1',
            since: new Date(Date.now() - 20 * 60_000).toISOString(),
          },
        ],
      }),
    );

    const { container, root } = await render('telemetry');

    const alerts = container.querySelector('.admin-alerts');
    expect(alerts?.textContent).toContain('Comet Courier');
    expect(alerts?.textContent).toContain('waiting to be published');
    // The count rides on the queue tab, because that is where the doing happens.
    expect(container.querySelector('.admin-tab-badge')?.textContent).toBe('1');

    await act(async () => root.unmount());
  });

  it('says so plainly when nothing needs attention', async () => {
    mocked.fetchAdminSummary.mockResolvedValue(summary());

    const { container, root } = await render('queue');

    expect(container.querySelector('.admin-alerts--clear')?.textContent).toBe('Nothing waiting on you.');

    await act(async () => root.unmount());
  });

  it('navigates by path, so a section survives a refresh', async () => {
    mocked.fetchAdminSummary.mockResolvedValue(summary());
    const onNavigate = vi.fn();

    const { container, root } = await render('queue', onNavigate);
    const tokensTab = Array.from(container.querySelectorAll('.admin-tab')).find(
      (tab) => tab.textContent === 'Tokens',
    ) as HTMLButtonElement;
    await act(async () => {
      tokensTab.click();
    });

    expect(onNavigate).toHaveBeenCalledWith('/admin/tokens');

    await act(async () => root.unmount());
  });
});
