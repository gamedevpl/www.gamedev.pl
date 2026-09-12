// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HANDOFF_CLICK_GUARD_MS, useHandoffClickGuard } from './useHandoffClickGuard.js';

function Probe() {
  useHandoffClickGuard();
  return null;
}

describe('useHandoffClickGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/studio/bastion-wave?from=handoff');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('swallows clicks for a beat after the welcome handoff', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<Probe />);
    });

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(HANDOFF_CLICK_GUARD_MS + 1);
    });
    const later = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('does not swallow clicks on an ordinary studio visit', async () => {
    window.history.replaceState(null, '', '/studio/bastion-wave');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<Probe />);
    });

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
