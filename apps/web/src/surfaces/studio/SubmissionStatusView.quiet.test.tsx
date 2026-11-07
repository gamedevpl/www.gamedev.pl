// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { getSubmissionStatus } from '../../submissionApi.js';
import { SubmissionStatusView } from './SubmissionStatusView.js';
import { ACTIVE_POLL_MS } from './studioStatusPoll.js';

vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return { ...actual, getSubmissionStatus: vi.fn() };
});

it.each([
  ['en', false],
  ['en', true],
  ['pl', false],
  ['pl', true],
] as const)(
  'treats quiet as unknown activity and recovers on the next signal (%s, collapsed: %s)',
  async (lang, collapsed) => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
    await i18n.changeLanguage(lang);
    if (collapsed) localStorage.setItem('gamedev_connect_collapsed:quiet-status', '1');
    vi.mocked(getSubmissionStatus).mockResolvedValue({
      status: 'building',
      builder: 'self',
      stall: 'quiet',
      lastAgentSignalAt: '2026-11-07T11:43:00Z',
      events: [],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes('/local-activity/')
            ? { activity: null }
            : {
                installSnippets: {},
                kickoffPrompt: 'Continue the game',
                mcpUrl: 'https://example.test/api/mcp',
                authorizationHeader: 'Authorization: Bearer test',
                authorizationHeaderMasked: 'Authorization: Bearer ····test',
                fingerprint: 'test',
                keyGeneration: 1,
                slug: 'quiet-game',
                expiresAt: Math.floor(Date.now() / 1000) + 3600,
              },
      })),
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(createElement(SubmissionStatusView, { token: 'quiet-status', embedded: true }));
      });
      const card = container.querySelector('.studio-connect');
      expect(card).not.toBeNull();
      if (collapsed) {
        expect(card?.getAttribute('aria-label')).toBe(i18n.t('connect.resume.title'));
        expect(card?.querySelector('[data-testid="connect-show"]')?.textContent).toContain(
          i18n.t('connect.resume.show'),
        );
      } else {
        expect(card?.textContent).toContain(i18n.t('connect.resume.lead'));
        expect(card?.textContent).toContain(i18n.t('connect.resume.kickoffTitle'));
      }
      expect(container.querySelector('.studio-context-phase')?.textContent).toBe(i18n.t('connect.resume.waiting'));
      expect(container.querySelector('.studio-context-beat')?.textContent).toContain('17');
      expect(container.querySelector('.studio-context-phase-spinner')).toBeNull();
      expect(container.textContent).not.toContain(i18n.t('connect.waiting'));

      vi.mocked(getSubmissionStatus).mockResolvedValue({
        status: 'building',
        builder: 'self',
        lastAgentSignalAt: new Date().toISOString(),
        events: [],
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
      });
      expect(container.querySelector('.studio-connect')).toBeNull();
      expect(container.textContent).not.toContain(i18n.t('connect.resume.waiting'));
      expect(container.textContent).toContain(i18n.t('statusView.states.building.label'));
    } finally {
      await act(async () => root.unmount());
      container.remove();
      localStorage.clear();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  },
);
