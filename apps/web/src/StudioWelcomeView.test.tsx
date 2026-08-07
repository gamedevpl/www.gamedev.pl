// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioWelcomeView } from './StudioWelcomeView.js';
import * as submissionApi from './submissionApi.js';

vi.mock('./submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi.js')>('./submissionApi.js');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(),
    listMySubmissions: vi.fn(),
  };
});

const getStatus = vi.mocked(submissionApi.getSubmissionStatus);
const listMine = vi.mocked(submissionApi.listMySubmissions);

describe('StudioWelcomeView', () => {
  let container: HTMLDivElement;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    getStatus.mockResolvedValue({
      status: 'queued',
      slug: 'bastion-wave',
      events: [{ id: 'e1', kind: 'milestone', text: 'Queued for the platform agent', createdAt: '2026-08-07T00:00:00Z' }],
    });
    listMine.mockResolvedValue([
      {
        token: 'tok-welcome',
        title: 'Bastion Wave Defense',
        createdAt: '2026-08-07T00:00:00Z',
        lastKnownStatus: 'queued',
        slug: 'bastion-wave',
      },
    ]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows progress and opens Studio only on the CTA', async () => {
    const onOpenStudio = vi.fn();
    await act(async () => {
      createRoot(container).render(createElement(StudioWelcomeView, { game: 'bastion-wave', onOpenStudio }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Portal mounts on document.body, not the test container.
    const dialog = document.querySelector('.studio-welcome');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Bastion Wave Defense');
    expect(dialog?.textContent).toContain('Queued for the platform agent');
    expect(dialog?.textContent).toContain('How to steer the agent');
    expect(onOpenStudio).not.toHaveBeenCalled();

    const cta = dialog?.querySelector('button.qa-primary') as HTMLButtonElement;
    expect(cta?.textContent).toMatch(/Open Studio/);
    await act(async () => {
      cta.click();
    });
    expect(onOpenStudio).toHaveBeenCalledWith('/studio/bastion-wave?from=handoff');
    expect(localStorage.getItem('gamedev_studio_onboarded')).toBe('1');
  });
});
