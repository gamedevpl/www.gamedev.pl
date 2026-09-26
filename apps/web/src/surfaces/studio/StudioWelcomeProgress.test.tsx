// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import * as submissionApi from '../../submissionApi.js';
import { StudioWelcomeView } from './StudioWelcomeView.js';

vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return { ...actual, getSubmissionStatus: vi.fn(), listMySubmissions: vi.fn() };
});

const getStatus = vi.mocked(submissionApi.getSubmissionStatus);
const listMine = vi.mocked(submissionApi.listMySubmissions);

async function renderWelcome() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(createElement(StudioWelcomeView, { game: 'cube-game', onOpenStudio: vi.fn() }));
    await Promise.resolve();
    await Promise.resolve();
  });
  return document.querySelector('.studio-welcome');
}

describe('StudioWelcomeView progress copy', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
    listMine.mockResolvedValue([
      {
        token: 'tok-cube',
        title: 'Cube Game',
        slug: 'cube-game',
        lastKnownStatus: 'building',
        createdAt: '2026-08-07T00:00:00Z',
      },
    ]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows an agent message once and leaves no empty checklist divider', async () => {
    getStatus.mockResolvedValue({
      status: 'building',
      slug: 'cube-game',
      events: [
        { id: 'e1', kind: 'step', step: 'fixing', text: 'Correcting the manifest.', createdAt: '2026-08-07T00:00:00Z' },
      ],
    });

    const dialog = await renderWelcome();
    expect(dialog?.querySelector('.studio-welcome-progress-message')?.textContent).toBe('Correcting the manifest.');
    expect(dialog?.querySelector('.studio-details-progress')).toBeNull();
    expect(dialog?.querySelector('.studio-welcome-checklist:empty')).toBeTruthy();
  });

  it('keeps checklist items while suppressing their repeated note', async () => {
    getStatus.mockResolvedValue({
      status: 'building',
      slug: 'cube-game',
      progress: {
        headSha: 'abc123',
        commits: [],
        revisions: [],
        checklist: [{ text: 'Make the cube move', checked: false }],
      },
      events: [
        { id: 'e1', kind: 'step', step: 'fixing', text: 'Correcting the manifest.', createdAt: '2026-08-07T00:00:00Z' },
      ],
    });

    const dialog = await renderWelcome();
    expect(dialog?.querySelector('.studio-details-progress')).toBeTruthy();
    expect(dialog?.querySelector('.studio-details-progress-note')).toBeNull();
    expect(dialog?.textContent).toContain('Make the cube move');
  });

  it('keeps a different note when the headline comes from a newer event', async () => {
    getStatus.mockResolvedValue({
      status: 'building',
      slug: 'cube-game',
      events: [
        { id: 'older', kind: 'step', text: 'Drawing the board.', createdAt: '2026-08-07T00:00:00Z' },
        { id: 'newer', kind: 'step', text: 'Adding controls.', createdAt: '2026-08-07T00:01:00Z' },
      ],
    });

    const dialog = await renderWelcome();
    expect(dialog?.querySelector('.studio-welcome-progress-message')?.textContent).toBe('Adding controls.');
    expect(dialog?.querySelector('.studio-details-progress-note')?.textContent).toContain('Drawing the board.');
  });
});
