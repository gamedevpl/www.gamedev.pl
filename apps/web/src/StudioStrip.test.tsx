// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioStrip, type StudioStripProps } from './StudioStrip.js';
import type { SubmissionStatus } from './submissionApi.js';

const hosts: Array<() => void> = [];

async function renderStrip(props: Partial<StudioStripProps> = {}) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  const defaultProps: StudioStripProps = {
    title: 'Global Thermonuclear Strategy',
    slug: 'global-thermonuclear-strategy',
    status: null,
    posture: 'watch',
    onPostureChange: vi.fn(),
    stageEmpty: false,
    onOpenShelf: vi.fn(),
    shelfOpen: false,
    editAvailable: false,
    editActive: false,
    onToggleEdit: vi.fn(),
    codeAvailable: false,
    codeActive: false,
    onToggleCode: vi.fn(),
    detailsActive: false,
    onToggleDetails: vi.fn(),
    onOpenBuild: vi.fn(),
    threadOpen: false,
    onToggleThread: vi.fn(),
    threadUnreadCount: 0,
    canClaim: false,
    onClaim: vi.fn(),
  };

  await act(async () => {
    root.render(<StudioStrip {...defaultProps} {...props} />);
  });
  hosts.push(() => {
    root.unmount();
    host.remove();
  });
  return host;
}

afterEach(async () => {
  while (hosts.length) {
    const cleanup = hosts.pop()!;
    await act(async () => {
      cleanup();
    });
  }
});

describe('StudioStrip layout structure', () => {
  const buildingStatus = {
    status: 'building',
    phase: 'submitted',
    recentBuilds: [
      { version: 'v1', createdAt: '2026-08-21T17:40:00.000Z', mode: 'publish', verdict: 'pending', total: 12 },
    ],
    gateProgress: { lane: 'publish', stage: 'trace', index: 5, total: 12, at: '2026-08-21T17:42:00.000Z' },
    lastAgentSignalAt: new Date(Date.now() - 180_000).toISOString(),
  } as unknown as SubmissionStatus;

  it('renders title as a link to /play/:slug when slug is present', async () => {
    const host = await renderStrip({ slug: 'my-game', title: 'My Game' });
    const link = host.querySelector<HTMLAnchorElement>('.studio-strip-title a');

    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/play/my-game');
    expect(link?.textContent).toBe('My Game');
  });

  it('renders title as text without link when slug is not present', async () => {
    const host = await renderStrip({ slug: undefined, title: 'Draft Game' });
    const titleEl = host.querySelector('.studio-strip-title');
    const link = host.querySelector('.studio-strip-title a');

    expect(link).toBeNull();
    expect(titleEl?.textContent).toBe('Draft Game');
  });

  it('does not render the slug code badge', async () => {
    const host = await renderStrip({ slug: 'my-game' });
    expect(host.querySelector('.studio-slug')).toBeNull();
  });

  it('places spacers around the status section', async () => {
    const host = await renderStrip({ status: buildingStatus });
    const strip = host.querySelector('.studio-strip');
    const children = Array.from(strip?.children ?? []);

    const titleBlockIndex = children.findIndex((el) => el.classList.contains('studio-strip-title-block'));
    const statusIndex = children.findIndex((el) => el.classList.contains('studio-strip-status'));
    const actionsIndex = children.findIndex((el) => el.classList.contains('studio-strip-actions'));

    expect(titleBlockIndex).toBeGreaterThan(-1);
    expect(statusIndex).toBeGreaterThan(titleBlockIndex);
    expect(actionsIndex).toBeGreaterThan(statusIndex);

    const spacerBefore = children[statusIndex - 1];
    const spacerAfter = children[statusIndex + 1];

    expect(spacerBefore?.classList.contains('studio-strip-spacer')).toBe(true);
    expect(spacerAfter?.classList.contains('studio-strip-spacer')).toBe(true);
  });

  it('includes heartbeat update text inside the status section', async () => {
    const host = await renderStrip({ status: buildingStatus });
    const statusBlock = host.querySelector('.studio-strip-status');

    expect(statusBlock?.querySelector('.studio-build-bar')).toBeTruthy();
    expect(statusBlock?.querySelector('.studio-strip-heartbeat')).toBeTruthy();
  });
});
