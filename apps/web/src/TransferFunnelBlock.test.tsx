// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TransferFunnelBlock } from './TransferFunnelBlock.js';
import type { VisitFunnel } from './healthApi.js';

// The risk is a number meaning something other than its label.

function mount(transfers: VisitFunnel['transfers']): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(TransferFunnelBlock, { funnel: { transfers } as VisitFunnel }));
  });
  // Cloned before unmount: React empties the host on the way out.
  const snapshot = host.cloneNode(true) as HTMLElement;
  act(() => root.unmount());
  return snapshot;
}

function render(transfers: VisitFunnel['transfers']): string {
  return mount(transfers).textContent ?? '';
}

// The share cell of the row whose label starts with `label`.
function shareOf(host: HTMLElement, label: string): string | undefined {
  const row = [...host.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.startsWith(label));
  return row?.querySelectorAll('td')[2]?.textContent ?? undefined;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TransferFunnelBlock', () => {
  it('reads each side against its own denominator, not against all visits', () => {
    const text = render({ sent: 10, cancelled: 2, offered: 4, answered: 3, accepted: 2, declined: 1 });

    // Cancelled is a share of sent; accepted, of offered.
    expect(text).toContain('20%');
    expect(text).toContain('50%');
    expect(text).toContain('75%');
  });

  it('says nothing happened rather than printing a row of zeroes', () => {
    const text = render({ sent: 0, cancelled: 0, offered: 0, answered: 0, accepted: 0, declined: 0 });

    expect(text).toContain('Nobody handed a game over');
    expect(text).not.toContain('0%');
  });

  it('separates a measured zero from no evidence at all', () => {
    // Zero cancelled is measured; zero offered has no denominator.
    const host = mount({ sent: 3, cancelled: 0, offered: 0, answered: 0, accepted: 0, declined: 0 });

    expect(shareOf(host, 'took the invitation back')).toBe('0%');
    expect(shareOf(host, 'accepted it')).toBe('—');
    expect(shareOf(host, 'declined it')).toBe('—');
  });

  it('renders nothing at all for a payload that predates the field', () => {
    expect(render(undefined)).toBe('');
  });
});
