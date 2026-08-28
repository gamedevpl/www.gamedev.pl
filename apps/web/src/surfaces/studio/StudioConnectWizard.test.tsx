// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioConnectWizard } from './StudioConnectWizard.js';
import * as connectApi from './connectApi.js';
import * as submissionApi from '../../submissionApi.js';

vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(),
    listMySubmissions: vi.fn(),
    handoffToPlatform: vi.fn(),
  };
});

vi.mock('./connectApi.js', async () => {
  const actual = await vi.importActual<typeof import('./connectApi.js')>('./connectApi.js');
  return {
    ...actual,
    getConnectPayload: vi.fn(),
  };
});

const getStatus = vi.mocked(submissionApi.getSubmissionStatus);
const listMine = vi.mocked(submissionApi.listMySubmissions);
const getConnect = vi.mocked(connectApi.getConnectPayload);
const handoff = vi.mocked(submissionApi.handoffToPlatform);

describe('StudioConnectWizard', () => {
  let container: HTMLDivElement;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    getStatus.mockResolvedValue({
      status: 'queued',
      builder: 'self',
      stall: 'no_agent_yet',
      slug: 'bastion-wave',
    });
    listMine.mockResolvedValue([
      {
        token: 'tok-connect',
        title: 'Bastion Wave Defense',
        createdAt: '2026-08-07T00:00:00Z',
        lastKnownStatus: 'queued',
        slug: 'bastion-wave',
      },
    ]);
    getConnect.mockResolvedValue({
      slug: 'bastion-wave',
      mcpUrl: 'https://www.gamedev.pl/api/mcp',
      authorizationHeader: 'Authorization: Bearer secret',
      authorizationHeaderMasked: 'Authorization: Bearer ••••',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      keyGeneration: 1,
      fingerprint: 'abcd',
      kickoffPrompt: 'Build bastion-wave',
      installSnippets: {
        claudeCode: 'claude',
        codex: 'codex',
        cursor: 'cursor',
        kimi: 'kimi',
        cli: 'cli',
      },
      installLinks: { cursor: 'cursor://add', vscode: 'vscode://add' },
      canSwitchToPlatform: true,
    });
    handoff.mockResolvedValue({});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('keeps the connect chapter until Open Studio or later', async () => {
    const onOpenStudio = vi.fn();
    await act(async () => {
      createRoot(container).render(createElement(StudioConnectWizard, { game: 'bastion-wave', onOpenStudio }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = document.querySelector('.studio-connect-wizard');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Bastion Wave Defense');
    expect(dialog?.textContent).toMatch(/Connect|agent/i);
    expect(onOpenStudio).not.toHaveBeenCalled();

    const later = Array.from(dialog?.querySelectorAll('button') ?? []).find((btn) =>
      /connect later/i.test(btn.textContent ?? ''),
    ) as HTMLButtonElement;
    expect(later).toBeTruthy();
    await act(async () => {
      later.click();
    });
    expect(onOpenStudio).toHaveBeenCalledWith('/studio/bastion-wave?from=handoff');
  });

  it('switches to Open Studio when the agent checks in', async () => {
    const onOpenStudio = vi.fn();
    getStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      slug: 'bastion-wave',
      lastAgentSignalAt: '2026-08-07T00:01:00Z',
    });

    await act(async () => {
      createRoot(container).render(createElement(StudioConnectWizard, { game: 'bastion-wave', onOpenStudio }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = document.querySelector('.studio-connect-wizard');
    expect(dialog?.textContent).toContain('Agent connected');
    const cta = dialog?.querySelector('button.qa-primary') as HTMLButtonElement;
    expect(cta?.textContent).toMatch(/Open Studio/);
    await act(async () => {
      cta.click();
    });
    expect(onOpenStudio).toHaveBeenCalledWith('/studio/bastion-wave?from=handoff');
  });

  it('hands the round to the Gamedev.pl agent and opens Studio', async () => {
    const onOpenStudio = vi.fn();
    await act(async () => {
      createRoot(container).render(createElement(StudioConnectWizard, { game: 'bastion-wave', onOpenStudio }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const control = document.querySelector('[data-testid="connect-switch-builder"]');
    expect(control).toBeTruthy();
    const start = control?.querySelector('button') as HTMLButtonElement;
    expect(start.textContent).toMatch(/Gamedev\.pl agent/i);
    await act(async () => {
      start.click();
    });

    const confirm = control?.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      confirm.click();
      await Promise.resolve();
    });

    expect(handoff).toHaveBeenCalledWith('tok-connect');
    expect(onOpenStudio).toHaveBeenCalledWith('/studio/bastion-wave?from=handoff');
  });

  it('stays on connect while a handoff waits for the agent to acknowledge', async () => {
    const onOpenStudio = vi.fn();
    handoff.mockResolvedValue({ pending: true });
    await act(async () => {
      createRoot(container).render(createElement(StudioConnectWizard, { game: 'bastion-wave', onOpenStudio }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const control = document.querySelector('[data-testid="connect-switch-builder"]');
    await act(async () => {
      (control?.querySelector('button') as HTMLButtonElement).click();
    });
    await act(async () => {
      (control?.querySelector('button') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(onOpenStudio).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="connect-switch-builder"]')?.textContent).toMatch(/acknowledge/i);
  });

  it('shows the latest agent updates once it checks in', async () => {
    getStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      slug: 'bastion-wave',
      lastAgentSignalAt: '2026-08-07T00:01:00Z',
      events: [
        {
          id: 'ev-2',
          kind: 'step',
          step: 'art',
          text: 'Drew the pumpkin sprite sheet',
          progress: { done: 2, total: 5 },
          createdAt: '2026-08-07T00:02:00Z',
        },
        { id: 'ev-1', kind: 'milestone', text: 'Read the kit', createdAt: '2026-08-07T00:01:00Z' },
      ],
    });

    await act(async () => {
      createRoot(container).render(createElement(StudioConnectWizard, { game: 'bastion-wave', onOpenStudio: vi.fn() }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const feed = document.querySelector('[data-testid="connect-wizard-feed"]');
    expect(feed?.textContent).toContain('Drew the pumpkin sprite sheet');
    expect(feed?.textContent).toContain('Read the kit');
    expect(feed?.textContent).toContain('Drawing');
    expect(document.querySelector('.studio-welcome-progress')?.textContent).toContain('2 of 5 done');
  });

  it('says it is waiting when a connected agent has posted nothing yet', async () => {
    getStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      slug: 'bastion-wave',
      lastAgentSignalAt: '2026-08-07T00:01:00Z',
    });

    await act(async () => {
      createRoot(container).render(createElement(StudioConnectWizard, { game: 'bastion-wave', onOpenStudio: vi.fn() }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.querySelector('[data-testid="connect-wizard-feed"]')).toBeNull();
    expect(document.querySelector('.studio-connect-wizard-feed-empty')?.textContent).toMatch(/Waiting for the first/i);
  });

  it('leaves the connect step for Studio once the agent has ended the round', async () => {
    const onOpenStudio = vi.fn();
    getStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      slug: 'bastion-wave',
      phase: 'submitted',
      lastAgentSignalAt: '2026-08-07T00:01:00Z',
      agentEndedAt: '2026-08-07T00:09:00Z',
    });

    await act(async () => {
      createRoot(container).render(createElement(StudioConnectWizard, { game: 'bastion-wave', onOpenStudio }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onOpenStudio).toHaveBeenCalledWith('/studio/bastion-wave?from=handoff', { replace: true });
  });

  it('leaves the connect step on an ended stall with no agentEndedAt', async () => {
    const onOpenStudio = vi.fn();
    getStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      slug: 'bastion-wave',
      stall: 'ended',
      lastAgentSignalAt: '2026-08-07T00:01:00Z',
    });

    await act(async () => {
      createRoot(container).render(createElement(StudioConnectWizard, { game: 'bastion-wave', onOpenStudio }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onOpenStudio).toHaveBeenCalledWith('/studio/bastion-wave?from=handoff', { replace: true });
  });

  it('leaves the connect step when the round has published', async () => {
    const onOpenStudio = vi.fn();
    getStatus.mockResolvedValue({ status: 'published', builder: 'self', slug: 'bastion-wave' });

    await act(async () => {
      createRoot(container).render(createElement(StudioConnectWizard, { game: 'bastion-wave', onOpenStudio }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onOpenStudio).toHaveBeenCalledWith('/studio/bastion-wave?from=handoff', { replace: true });
  });

  it('uses resume connect mode when a quiet agent resurfaces the card', async () => {
    getStatus.mockResolvedValue({
      status: 'building',
      builder: 'self',
      stall: 'quiet',
      slug: 'bastion-wave',
      lastAgentSignalAt: '2026-08-07T00:01:00Z',
    });

    await act(async () => {
      createRoot(container).render(createElement(StudioConnectWizard, { game: 'bastion-wave', onOpenStudio: vi.fn() }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const card = document.querySelector('.studio-connect');
    expect(card?.getAttribute('data-connect-mode')).toBe('resume');
  });
});
