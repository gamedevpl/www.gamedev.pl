// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { SubmissionStatusView } from './SubmissionStatusView.js';
import { getSubmissionStatus, type SubmissionStatus } from '../../submissionApi.js';
import { pokeStudioStatus } from './studioStatusStore.js';
import { fetchNotificationPreferences } from '../../notificationsApi.js';

vi.mock('../../visitTelemetry', async () => {
  const actual = await vi.importActual<typeof import('../../visitTelemetry')>('../../visitTelemetry');
  return { ...actual, recordStudioStep: vi.fn() };
});

vi.mock('../../submissionApi', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi')>('../../submissionApi');
  return {
    ...actual,
    getSubmissionStatus: vi.fn(),
    getSubmissionPreview: vi.fn().mockRejectedValue(new Error('none')),
    getChannelPlayable: vi.fn().mockRejectedValue(new Error('none')),
  };
});

vi.mock('../../notificationsApi', async () => {
  const actual = await vi.importActual<typeof import('../../notificationsApi')>('../../notificationsApi');
  return { ...actual, fetchNotificationPreferences: vi.fn() };
});

const mockedStatus = vi.mocked(getSubmissionStatus);
const mockedPrefs = vi.mocked(fetchNotificationPreferences);
const roots: Array<{ unmount: () => void }> = [];

afterEach(async () => {
  roots.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
  mockedStatus.mockReset();
  mockedPrefs.mockReset();
  await i18n.changeLanguage('en');
});

async function flush() {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

// A green preview waiting on its concept card.
function greenPreview(dreaming: boolean): SubmissionStatus {
  return {
    status: 'in_review',
    phase: 'ready_for_review',
    slug: 'dream-game',
    previewGate: { green: true, ranAt: '2026-10-10T12:00:00.000Z' },
    ...(dreaming ? { dreaming: { since: '2026-10-10T12:00:05.000Z' } } : {}),
  } as SubmissionStatus;
}

async function mount(token: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(SubmissionStatusView, { token, embedded: true }));
    await flush();
  });
  return container;
}

describe('Studio thread while a concept proposal is drawing', () => {
  beforeEach(() => {
    mockedPrefs.mockResolvedValue({ proposals: true } as Awaited<ReturnType<typeof fetchNotificationPreferences>>);
  });

  it('hides the line from a creator who muted proposals', async () => {
    mockedPrefs.mockResolvedValue({ proposals: false } as Awaited<ReturnType<typeof fetchNotificationPreferences>>);
    mockedStatus.mockResolvedValue(greenPreview(true));
    const container = await mount('dream-muted');
    expect(mockedPrefs).toHaveBeenCalled();
    expect(container.querySelector('.studio-turn.is-dreaming')).toBeNull();
  });

  it('shows the sketching line while the run is in progress', async () => {
    mockedStatus.mockResolvedValue(greenPreview(true));
    const container = await mount('dream-on');
    const line = container.querySelector('.studio-turn.is-dreaming');
    expect(line?.textContent).toBe('Sketching two directions for the next round…');
    expect(line?.querySelector('.studio-turn-working-pulse')).not.toBeNull();
  });

  it('shows nothing when no run is in progress', async () => {
    mockedStatus.mockResolvedValue(greenPreview(false));
    const container = await mount('dream-off');
    expect(container.querySelector('.studio-turn.is-dreaming')).toBeNull();
  });

  it('drops the line once the run is gone from the status', async () => {
    mockedStatus.mockResolvedValue(greenPreview(true));
    const container = await mount('dream-ends');
    expect(container.querySelector('.studio-turn.is-dreaming')).not.toBeNull();

    mockedStatus.mockResolvedValue(greenPreview(false));
    await act(async () => {
      pokeStudioStatus('dream-ends', 'en');
      await flush();
    });
    expect(container.querySelector('.studio-turn.is-dreaming')).toBeNull();
  });

  it('speaks Polish to a Polish reader', async () => {
    await i18n.changeLanguage('pl');
    mockedStatus.mockResolvedValue(greenPreview(true));
    const container = await mount('dream-pl');
    expect(container.querySelector('.studio-turn.is-dreaming')?.textContent).toBe(
      'Szkicuję dwa kierunki na następną rundę…',
    );
  });
});
