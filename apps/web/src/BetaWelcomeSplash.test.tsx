// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { BetaWelcomeSplash } from './BetaWelcomeSplash.js';
import { setVisitSessionForTesting, VisitSession } from './visitTelemetry.js';

describe('BetaWelcomeSplash', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    setVisitSessionForTesting(null);
    vi.restoreAllMocks();
  });

  it('welcomes a first-time tester and records the continue action', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const sent: unknown[] = [];
    const session = new VisitSession('44444444-4444-4444-8444-444444444444', 0, (body) => sent.push(body));
    setVisitSessionForTesting(session);
    await i18n.changeLanguage('en');

    const onContinue = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(createElement(BetaWelcomeSplash, { onContinue }));
      await Promise.resolve();
    });

    expect(document.querySelector('[role="dialog"] h1')?.textContent).toContain('Welcome');
    expect(document.querySelector('.beta-welcome-mascot .mascot')).not.toBeNull();
    expect(document.querySelectorAll('.beta-welcome-path article')).toHaveLength(3);
    expect(document.querySelector('.beta-welcome-path a[href="/contact"]')?.textContent).toBe('Contact us');

    await act(async () => {
      document.querySelector<HTMLButtonElement>('.beta-welcome-cta')?.click();
      await Promise.resolve();
    });
    session.flush();

    expect(onContinue).toHaveBeenCalledOnce();
    expect(sent[0]).toMatchObject({
      events: [
        { type: 'beta_welcome_step', step: 'shown' },
        { type: 'beta_welcome_step', step: 'continued' },
      ],
    });

    await act(async () => root.unmount());
  });
});
