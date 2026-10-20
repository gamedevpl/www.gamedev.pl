// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { SubmissionStatus } from '../../submissionApi.js';
import { StudioWelcomeView } from './StudioWelcomeView.js';
import { useGatedStatusPoll } from './useGatedStatusPoll.js';

vi.mock('./useGatedStatusPoll.js', () => ({ useGatedStatusPoll: vi.fn() }));
vi.mock('./studioWelcome.js', () => ({
  isStudioOnboarded: () => true,
  markStudioOnboarded: vi.fn(),
  resolveWelcomeToken: async () => ({ token: 'tok-tiny', title: 'Tiny Torque' }),
}));

const startedAt = '2026-10-20T20:59:35.000Z';
const endedAt = '2026-10-20T21:04:59.000Z';
let root: Root;

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T21:10:00.000Z'));
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function render(status: SubmissionStatus) {
  vi.mocked(useGatedStatusPoll).mockReturnValue(status);
  await act(async () => root.render(createElement(StudioWelcomeView, { game: 'tiny-torque', onOpenStudio: vi.fn() })));
  return document.querySelector('.studio-welcome-timer');
}

it('shows the whole round after reload with only a final agent message', async () => {
  const timer = await render({
    status: 'in_review',
    roundStartedAt: startedAt,
    agentEndedAt: endedAt,
    events: [{ id: 'done', kind: 'done', text: 'Draft ready.', createdAt: endedAt }],
  });
  expect(timer?.textContent).toBe('Completed in 5m 24s');
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(timer?.textContent).toBe('Completed in 5m 24s');
});

it('does not shorten the round to the capped event history', async () => {
  const timer = await render({
    status: 'in_review',
    roundStartedAt: startedAt,
    agentEndedAt: endedAt,
    events: [{ id: 'late', kind: 'step', text: 'Checking.', createdAt: '2026-10-20T21:04:00.000Z' }],
  });
  expect(timer?.textContent).toBe('Completed in 5m 24s');
});

it.each([undefined, 'invalid'])('hides completed duration without a valid start (%s)', async (roundStartedAt) => {
  const timer = await render({ status: 'in_review', roundStartedAt, agentEndedAt: endedAt });
  expect(timer).toBeNull();
});

it('hides completed duration when the end predates the current round', async () => {
  const timer = await render({ status: 'in_review', roundStartedAt: endedAt, agentEndedAt: startedAt });
  expect(timer).toBeNull();
});

it('counts from the server start while running, then freezes at delivery', async () => {
  const status: SubmissionStatus = { status: 'building', roundStartedAt: startedAt };
  expect((await render(status))?.textContent).toBe('10m 25s');
  await act(async () => vi.advanceTimersByTime(1000));
  expect(document.querySelector('.studio-welcome-timer')?.textContent).toBe('10m 26s');
  const timer = await render({
    ...status,
    playable: [
      { ref: 'preview-1', createdAt: endedAt },
      { ref: 'previous-round', createdAt: '2026-10-19T20:00:00.000Z' },
      { ref: 'seed', origin: 'seed', createdAt: startedAt },
    ],
  });
  expect(timer?.textContent).toBe('Completed in 5m 24s');
});
