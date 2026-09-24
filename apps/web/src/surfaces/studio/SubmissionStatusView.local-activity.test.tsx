// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { getSubmissionStatus } from '../../submissionApi.js';
import { SubmissionStatusView } from './SubmissionStatusView.js';

vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return { ...actual, getSubmissionStatus: vi.fn() };
});

it.each([false, true])('shows local Codex work before any MCP check-in (collapsed: %s)', async (collapsed) => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  if (collapsed) localStorage.setItem('gamedev_connect_collapsed:local-token', '1');
  vi.mocked(getSubmissionStatus).mockResolvedValue({ status: 'queued', stall: 'no_agent_yet', builder: 'self' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes('/local-activity/')
        ? {
            ok: true,
            json: async () => ({
              activity: { runId: 'local-run', agent: 'codex', phase: 'editing', at: new Date().toISOString() },
            }),
          }
        : {
            ok: true,
            json: async () => ({
              installSnippets: {},
              kickoffPrompt: 'Build the game',
              mcpUrl: 'https://example.test/api/mcp',
              authorizationHeader: 'Authorization: Bearer test',
              authorizationHeaderMasked: 'Authorization: Bearer ····test',
              fingerprint: 'test',
              keyGeneration: 1,
              slug: 'local-game',
              expiresAt: Math.floor(Date.now() / 1000) + 3600,
            }),
          },
    ),
  );
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(createElement(SubmissionStatusView, { token: 'local-token', embedded: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    if (collapsed) expect(container.querySelector('[data-testid="connect-collapsed"]')).not.toBeNull();
    else expect(container.querySelector('.studio-connect-title')?.textContent).toBe('Local agent: codex');
    expect(container.querySelector('.studio-connect')?.textContent).toContain('The agent is editing locally.');
    expect(container.querySelector('.studio-connect')?.textContent).toContain(
      'Game files remain on your computer until you submit them.',
    );
    expect(container.querySelector('.studio-thread-foot .studio-context-phase')?.textContent).toContain(
      'The agent is editing locally.',
    );
    expect(container.textContent).not.toContain('Waiting for your agent to check in');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});
