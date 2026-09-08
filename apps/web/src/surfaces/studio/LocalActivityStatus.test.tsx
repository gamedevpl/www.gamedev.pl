// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { LocalActivityStatus } from './LocalActivityStatus.js';
it('shows local progress, lost contact and a completed task distinctly', async () => {
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  const root = createRoot(host);
  const activity = { runId: 'run', agent: 'agy', phase: 'editing', at: new Date().toISOString() };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ activity: { ...activity } }) })),
  );
  try {
    await act(async () => root.render(createElement(LocalActivityStatus, { token: 'one', key: 'one' })));
    expect(host.textContent).toContain('editing locally');
    activity.at = new Date(Date.now() - 60_000).toISOString();
    await act(async () => root.render(createElement(LocalActivityStatus, { token: 'two', key: 'two' })));
    expect(host.textContent).toContain('Contact with the CLI was lost');
    activity.phase = 'ready';
    await act(async () => root.render(createElement(LocalActivityStatus, { token: 'three', key: 'three' })));
    expect(host.textContent).toContain('Ready to send with /submit');
    expect(host.textContent).not.toContain('Contact with the CLI was lost');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
