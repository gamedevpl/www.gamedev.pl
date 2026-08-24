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
      events: [
        { id: 'e1', kind: 'milestone', text: 'Queued for the platform agent', createdAt: '2026-08-07T00:00:00Z' },
      ],
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
    expect(dialog?.querySelector('.studio-welcome-mascot')).toBeTruthy();
    expect(dialog?.querySelector('.studio-welcome-pulse-dot')).toBeTruthy();
    expect(dialog?.querySelector('.studio-welcome-timer')).toBeTruthy();
    expect(onOpenStudio).not.toHaveBeenCalled();

    const cta = dialog?.querySelector('button.qa-primary') as HTMLButtonElement;
    expect(cta?.textContent).toMatch(/Open Studio/);
    await act(async () => {
      cta.click();
    });
    expect(onOpenStudio).toHaveBeenCalledWith('/studio/bastion-wave?from=handoff');
    expect(localStorage.getItem('gamedev_studio_onboarded')).toBe('1');
  });

  it('clearly displays draft ready state and Play CTA when build finishes', async () => {
    getStatus.mockResolvedValue({
      status: 'in_review',
      phase: 'ready_for_review',
      slug: 'bastion-wave',
      events: [
        {
          id: 'e1',
          kind: 'done',
          text: 'Full gate checks complete: typecheck, smoke, validate',
          createdAt: '2026-08-07T00:00:00Z',
        },
      ],
    });

    const onOpenStudio = vi.fn();
    await act(async () => {
      createRoot(container).render(createElement(StudioWelcomeView, { game: 'bastion-wave', onOpenStudio }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = document.querySelector('.studio-welcome');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Draft ready!');
    expect(dialog?.textContent).toContain('Ready to Play');
    expect(dialog?.textContent).toContain('Full gate checks complete');
    const callout = dialog?.querySelector('.studio-welcome-ready-callout') as HTMLButtonElement;
    expect(callout).toBeTruthy();
    expect(callout.tagName).toBe('BUTTON');

    const cta = dialog?.querySelector('button.qa-primary') as HTMLButtonElement;
    expect(cta?.classList.contains('is-ready-cta')).toBe(true);
    expect(cta?.textContent).toMatch(/Play Draft in Studio/);

    await act(async () => {
      callout.click();
    });
    expect(onOpenStudio).toHaveBeenCalledWith('/studio/bastion-wave?from=handoff');
  });

  it('keeps building while the only playable builds are the seed and the staged tree', async () => {
    getStatus.mockResolvedValue({
      status: 'building',
      phase: 'building',
      slug: 'bastion-wave',
      playable: [
        { ref: 'staged-1', origin: 'staged', createdAt: '2026-08-07T00:01:00Z' },
        { ref: 'seed-1', origin: 'seed', createdAt: '2026-08-07T00:00:10Z' },
      ],
      events: [{ id: 'e1', kind: 'step', text: 'Writing the apple-picking loop', createdAt: '2026-08-07T00:00:00Z' }],
    });

    await act(async () => {
      createRoot(container).render(createElement(StudioWelcomeView, { game: 'bastion-wave', onOpenStudio: vi.fn() }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = document.querySelector('.studio-welcome');
    expect(dialog?.textContent).not.toContain('Draft ready!');
    expect(dialog?.querySelector('.studio-welcome-ready-callout')).toBeNull();
    expect(dialog?.textContent).toContain('Writing the apple-picking loop');
  });

  it('reports ready once the agent pushes a playable build of its own', async () => {
    getStatus.mockResolvedValue({
      status: 'building',
      phase: 'building',
      slug: 'bastion-wave',
      playable: [
        { ref: 'agent-1', createdAt: '2026-08-07T00:02:00Z' },
        { ref: 'seed-1', origin: 'seed', createdAt: '2026-08-07T00:00:10Z' },
      ],
      events: [{ id: 'e1', kind: 'step', text: 'Pushed a playable build', createdAt: '2026-08-07T00:00:00Z' }],
    });

    await act(async () => {
      createRoot(container).render(createElement(StudioWelcomeView, { game: 'bastion-wave', onOpenStudio: vi.fn() }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = document.querySelector('.studio-welcome');
    expect(dialog?.textContent).toContain('Draft ready!');
    expect(dialog?.querySelector('.studio-welcome-ready-callout')).toBeTruthy();
  });
});
