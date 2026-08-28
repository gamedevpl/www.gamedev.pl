// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioVersionRibbon, type StudioVersionRibbonProps } from './StudioVersionRibbon.js';

async function mount(props: StudioVersionRibbonProps) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StudioVersionRibbon {...props} />);
  });
  return {
    host,
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}

describe('StudioVersionRibbon', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing before any build has ever landed', async () => {
    const { host, unmount } = await mount({
      origin: { kind: 'none', at: null, versionLabel: null },
      stageStatus: { kind: 'empty' },
    });
    expect(host.querySelector('.studio-version-ribbon')).toBeNull();
    unmount();
  });

  it('names a staged build by the time it was observed', async () => {
    const at = new Date('2026-08-10T14:32:00Z').getTime();
    const { host, unmount } = await mount({
      origin: { kind: 'staged', at, versionLabel: null },
      stageStatus: { kind: 'ready' },
    });
    expect(host.querySelector('.studio-version-ribbon-identity')?.textContent).toContain('STAGED');
    expect(host.querySelector('.studio-version-ribbon-exception')).toBeNull();
    unmount();
  });

  it('never says a cause it does not know — a stale stage is a fact, not a guess', async () => {
    // The suffix must never claim "didn't compile" (a cause), only that a newer
    // stage did not take (staged-preview failure is silent by design).
    const { host, unmount } = await mount({
      origin: { kind: 'staged', at: Date.now(), versionLabel: null },
      stageStatus: { kind: 'ready' },
      newerStageWaiting: true,
    });
    const exception = host.querySelector('.studio-version-ribbon-exception')?.textContent ?? '';
    expect(exception.toLowerCase()).not.toContain('compile');
    unmount();
  });

  it('shows the worst exception, not an accumulating sentence', async () => {
    // Crashed outranks a merely-waiting newer stage — only one exception shows.
    const { host, unmount } = await mount({
      origin: { kind: 'staged', at: Date.now(), versionLabel: null },
      stageStatus: { kind: 'crashed', message: 'TypeError: x is not a function' },
      newerStageWaiting: true,
      deliveryInGate: true,
    });
    expect(host.querySelectorAll('.studio-version-ribbon-exception').length).toBe(1);
    expect(host.querySelector('.studio-version-ribbon')?.classList.contains('has-exception')).toBe(true);
    unmount();
  });

  it('collapses depth to a dot when an exception is showing, and shows it otherwise', async () => {
    const withException = await mount({
      origin: { kind: 'staged', at: Date.now(), versionLabel: null },
      stageStatus: { kind: 'crashed', message: 'boom' },
      checked: true,
    });
    expect(withException.host.querySelector('.studio-version-ribbon-depth')).toBeNull();
    withException.unmount();

    const clean = await mount({
      origin: { kind: 'staged', at: Date.now(), versionLabel: null },
      stageStatus: { kind: 'ready' },
      checked: true,
    });
    expect(clean.host.querySelector('.studio-version-ribbon-depth')).not.toBeNull();
    clean.unmount();
  });

  it('names a delivered build by its publish time when known', async () => {
    const { host, unmount } = await mount({
      origin: { kind: 'delivered', at: null, versionLabel: null },
      publishedAt: '2026-08-10T12:04:00Z',
      stageStatus: { kind: 'ready' },
    });
    expect(host.querySelector('.studio-version-ribbon-identity')?.textContent).toMatch(/delivered/i);
    unmount();
  });
});
