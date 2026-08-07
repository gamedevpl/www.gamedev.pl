// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioConnectWizard } from './StudioConnectWizard.js';
import * as connectApi from './connectApi.js';
import * as submissionApi from './submissionApi.js';

vi.mock('./submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi.js')>('./submissionApi.js');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(),
    listMySubmissions: vi.fn(),
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
    });
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
});
