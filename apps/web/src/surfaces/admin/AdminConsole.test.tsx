// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminConsole } from './AdminConsole.js';
import type { AdminSummary } from './adminApi.js';
import type { AdminSection } from '../../router.js';

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
vi.mock('../../GameHealthView.js', () => ({ GameHealthView: () => createElement('p', null, 'telemetry-panel') }));
vi.mock('./CostsPanel.js', () => ({ CostsPanel: () => createElement('p', null, 'costs-panel') }));
vi.mock('./CreationLimitsPanel.js', () => ({ CreationLimitsPanel: () => createElement('p', null, 'limits-panel') }));
vi.mock('./AccessTokensPanel.js', () => ({ AccessTokensPanel: () => createElement('p', null, 'tokens-panel') }));
vi.mock('./SuggestionsPanel.js', () => ({ SuggestionsPanel: () => createElement('p', null, 'suggestions-panel') }));
vi.mock('./WaitlistPanel.js', () => ({ WaitlistPanel: () => createElement('p', null, 'waitlist-panel') }));

function summary(overrides: Partial<AdminSummary> = {}): AdminSummary {
  return {
    alerts: [],
    queue: { active: 2, stalled: 0, byState: { building: 2 } },
    limits: { paused: false, globalDailySubmissionCap: 50, todaySubmissions: 3 },
    waitlist: { pending: 0 },
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

/** The banner is one line until asked; the rows only exist once it is open. */
async function openAlerts(container: HTMLElement) {
  const toggle = container.querySelector('.admin-alerts-summary') as HTMLElement;
  await act(async () => {
    toggle.click();
  });
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
            jobId: 1_000_001,
            title: 'Comet Courier',
            ownerUid: 'g:1',
            since: new Date(Date.now() - 20 * 60_000).toISOString(),
          },
        ],
      }),
    );

    const { container, root } = await render('telemetry');

    // Closed, it is one line that still says how many and of what kind.
    expect(container.querySelector('.admin-alerts-summary')?.textContent).toContain('1 ready to publish');
    // The count rides on the queue tab, because that is where the doing happens.
    expect(container.querySelector('.admin-tab-badge')?.textContent).toBe('1');

    await openAlerts(container);
    const alerts = container.querySelector('.admin-alerts');
    expect(alerts?.textContent).toContain('Comet Courier');
    expect(alerts?.textContent).toContain('waiting to be published');

    await act(async () => root.unmount());
  });

  it('sends an alert to the queue, which is the only place it can be acted on', async () => {
    mocked.fetchAdminSummary.mockResolvedValue(
      summary({
        alerts: [
          {
            id: 'op-1-build_stalled',
            kind: 'build_stalled',
            jobId: 1_000_001,
            title: 'Comet Courier',
            ownerUid: 'g:1',
            since: new Date(Date.now() - 20 * 60_000).toISOString(),
            stall: 'quiet',
          },
        ],
      }),
    );
    const onNavigate = vi.fn();

    const { container, root } = await render('telemetry', onNavigate);
    await openAlerts(container);
    await act(async () => {
      (container.querySelector('.admin-alert-open') as HTMLElement).click();
    });

    expect(onNavigate).toHaveBeenCalledWith('/admin/queue');

    await act(async () => root.unmount());
  });

  it('never reports a negative age when the browser clock runs behind', async () => {
    // `since` is the server's clock and `now` is the browser's. A minute of skew used to
    // render an alert as having waited "-1m".
    mocked.fetchAdminSummary.mockResolvedValue(
      summary({
        alerts: [
          {
            id: 'op-1-review_ready',
            kind: 'review_ready',
            jobId: 1_000_001,
            title: 'Comet Courier',
            ownerUid: 'g:1',
            since: new Date(Date.now() + 90_000).toISOString(),
          },
        ],
      }),
    );

    const { container, root } = await render('queue');
    await openAlerts(container);

    expect(container.querySelector('.admin-alert-age')?.textContent).toContain('0m');
    expect(container.textContent).not.toContain('-1m');

    await act(async () => root.unmount());
  });

  it('shows no banner at all when nothing is waiting', async () => {
    // A banner that is always on screen is furniture, not a signal — and the header
    // counts already say the queue is quiet.
    mocked.fetchAdminSummary.mockResolvedValue(summary());

    const { container, root } = await render('queue');

    expect(container.querySelector('.admin-alerts')).toBeNull();
    expect(container.textContent).not.toContain('waiting on you');

    await act(async () => root.unmount());
  });

  it('flags a pulled breaker on the tab that can put it back', async () => {
    // Creation being paused is invisible from five of the six sections otherwise.
    mocked.fetchAdminSummary.mockResolvedValue(
      summary({ limits: { paused: true, globalDailySubmissionCap: 50, todaySubmissions: 3 } }),
    );

    const { container, root } = await render('telemetry');

    const limitsTab = Array.from(container.querySelectorAll('.admin-tab')).find((tab) =>
      tab.textContent?.startsWith('Limits'),
    );
    expect(limitsTab?.querySelector('.admin-tab-badge')?.textContent).toBe('paused');

    await act(async () => root.unmount());
  });

  it('navigates by path, so a section survives a refresh', async () => {
    mocked.fetchAdminSummary.mockResolvedValue(summary());
    const onNavigate = vi.fn();

    const { container, root } = await render('queue', onNavigate);
    const tokensTab = Array.from(container.querySelectorAll('.admin-tab')).find(
      (tab) => tab.textContent === 'Tokens',
    ) as HTMLAnchorElement;
    // A real href, so the section can also be opened in a new tab the way any other
    // address on the site can.
    expect(tokensTab.getAttribute('href')).toBe('/admin/tokens');
    await act(async () => {
      tokensTab.click();
    });

    expect(onNavigate).toHaveBeenCalledWith('/admin/tokens');

    await act(async () => root.unmount());
  });

  it('routes to the waitlist section and badges pending applicants', async () => {
    mocked.fetchAdminSummary.mockResolvedValue(summary({ waitlist: { pending: 3 } }));

    const { container, root } = await render('waitlist');

    expect(container.textContent).toContain('waitlist-panel');
    const waitlistTab = Array.from(container.querySelectorAll('.admin-tab')).find((tab) =>
      tab.textContent?.startsWith('Waitlist'),
    );
    expect(waitlistTab?.classList.contains('is-active')).toBe(true);
    expect(waitlistTab?.getAttribute('href')).toBe('/admin/waitlist');
    expect(waitlistTab?.querySelector('.admin-tab-badge')?.textContent).toBe('3');

    await act(async () => root.unmount());
  });
});
