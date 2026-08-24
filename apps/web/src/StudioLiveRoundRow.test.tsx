// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from './i18n/index.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';
import type { SubmissionStatus } from './submissionApi.js';

async function mount(status: SubmissionStatus, props: { emptyLabel?: string } = {}) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StudioBuildHistory status={status} {...props} />);
  });
  return {
    host,
    unmount: () => {
      root.unmount();
      host.remove();
    },
    click: async (el: Element) => {
      await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    },
  };
}

describe('StudioLiveRoundRow (via StudioBuildHistory)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the empty label when idle with no history at all', async () => {
    const { host, unmount } = await mount({ status: 'in_review' }, { emptyLabel: 'Nothing here yet' });
    expect(host.querySelector('[data-testid="studio-build-history"]')).toBeNull();
    expect(host.textContent).toContain('Nothing here yet');
    unmount();
  });

  it('does not show a live-round row once this round has its own pending build', async () => {
    const { host, unmount } = await mount({
      status: 'building',
      issueNumber: 7,
      recentBuilds: [
        { version: 'v1', createdAt: new Date().toISOString(), mode: 'publish', verdict: 'pending', issueNumber: 7 },
      ],
    });
    expect(host.querySelector('[data-testid="studio-build-history-live-round"]')).toBeNull();
    unmount();
  });

  it('shows the live round on a later round even though slug history is non-empty', async () => {
    const { host, unmount } = await mount({
      status: 'building',
      issueNumber: 12,
      lastAgentSignalAt: new Date().toISOString(),
      recentBuilds: [
        { version: 'v1', createdAt: new Date().toISOString(), mode: 'publish', verdict: 'green', issueNumber: 7 },
      ],
    });
    expect(host.querySelector('[data-testid="studio-build-history-live-round"]')).not.toBeNull();
    // The prior round's delivery still lists below the live row.
    expect(host.querySelectorAll('.studio-build-history-row').length).toBe(2);
    unmount();
  });

  it('shows an expandable live-round row before any delivery this round, open by default', async () => {
    const { host, unmount, click } = await mount({
      status: 'building',
      lastAgentSignalAt: new Date().toISOString(),
      events: [{ id: 'e1', kind: 'step', text: 'Drawing the hero sprite', createdAt: new Date().toISOString() }],
    });
    const row = host.querySelector('[data-testid="studio-build-history-live-round"]');
    expect(row).not.toBeNull();
    expect(host.querySelector('.studio-build-history-dot.is-live')).not.toBeNull();
    expect(host.textContent).toContain('Round in progress');
    expect(host.querySelector('[data-testid="build-details-live-round"]')?.textContent).toContain(
      'Drawing the hero sprite',
    );

    await click(row!);
    expect(host.querySelector('[data-testid="build-details-live-round"]')).toBeNull();
    unmount();
  });
});
