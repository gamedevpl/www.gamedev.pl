// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../submissionApi.js', () => ({
  getSubmissionStatus: vi.fn(),
}));

import { getSubmissionStatus, type SubmissionStatus } from '../../submissionApi.js';
import { noteStudioInteraction, pokeStudioStatus, subscribeStudioStatus } from './studioStatusStore.js';

const ACTIVE_MS = 3_000;

const statusFixture = (pollAfterMs?: number): SubmissionStatus =>
  ({ status: 'building', ...(pollAfterMs === undefined ? {} : { pollAfterMs }) }) as SubmissionStatus;

function watcher() {
  return { intervalMs: () => ACTIVE_MS };
}

// Advances the poll and counts the fetches in that span.
async function fetchesOver(ms: number): Promise<number> {
  const before = vi.mocked(getSubmissionStatus).mock.calls.length;
  await vi.advanceTimersByTimeAsync(ms);
  return vi.mocked(getSubmissionStatus).mock.calls.length - before;
}

let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getSubmissionStatus).mockReset();
  vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
  hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  noteStudioInteraction();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setHidden(next: boolean): void {
  hidden = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('status poll gating', () => {
  it('leaves a watched round at its own cadence', async () => {
    const key = `token-${Math.random()}`;
    const stop = subscribeStudioStatus(key, 'en', watcher());
    await vi.waitFor(() => expect(getSubmissionStatus).toHaveBeenCalled());

    // Ten cadences of attention: interaction keeps the idle gate shut.
    let polls = 0;
    for (let i = 0; i < 10; i += 1) {
      noteStudioInteraction();
      polls += await fetchesOver(ACTIVE_MS);
    }
    expect(polls).toBe(10);
    stop();
  });

  it('stops while the tab is hidden and catches up on return', async () => {
    const key = `token-${Math.random()}`;
    const stop = subscribeStudioStatus(key, 'en', watcher());
    await vi.waitFor(() => expect(getSubmissionStatus).toHaveBeenCalled());

    setHidden(true);
    expect(await fetchesOver(10 * 60_000)).toBe(0);

    setHidden(false);
    expect(await fetchesOver(0)).toBe(1);
    stop();
  });

  it('widens a visible tab nobody has touched, without stopping it', async () => {
    const key = `token-${Math.random()}`;
    const stop = subscribeStudioStatus(key, 'en', watcher());
    await vi.waitFor(() => expect(getSubmissionStatus).toHaveBeenCalled());

    // Past the 30-minute step, so the floor is a minute.
    await vi.advanceTimersByTimeAsync(31 * 60_000);
    const polls = await fetchesOver(5 * 60_000);
    expect(polls).toBeGreaterThan(0);
    expect(polls).toBeLessThanOrEqual(6);
    stop();
  });

  it('returns to the fast cadence the moment the creator touches the page', async () => {
    const key = `token-${Math.random()}`;
    const stop = subscribeStudioStatus(key, 'en', watcher());
    await vi.waitFor(() => expect(getSubmissionStatus).toHaveBeenCalled());

    await vi.advanceTimersByTimeAsync(31 * 60_000);
    await fetchesOver(2 * 60_000);

    // No visibilitychange here: interaction alone has to lift the slow timer.
    noteStudioInteraction();
    expect(await fetchesOver(ACTIVE_MS * 3)).toBeGreaterThanOrEqual(2);
    stop();
  });

  it('obeys a server floor even while the page is being used', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture(60_000));
    const key = `token-${Math.random()}`;
    const stop = subscribeStudioStatus(key, 'en', watcher());
    await vi.waitFor(() => expect(getSubmissionStatus).toHaveBeenCalled());

    noteStudioInteraction();
    // The subscriber wants 3s; the server said a minute.
    expect(await fetchesOver(30_000)).toBe(0);
    expect(await fetchesOver(31_000)).toBe(1);
    stop();
  });

  it('never makes the creator wait for their own action', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture(60_000));
    const key = `token-${Math.random()}`;
    const stop = subscribeStudioStatus(key, 'en', watcher());
    await vi.waitFor(() => expect(getSubmissionStatus).toHaveBeenCalled());

    const before = vi.mocked(getSubmissionStatus).mock.calls.length;
    pokeStudioStatus(key, 'en');
    await vi.waitFor(() => expect(getSubmissionStatus).toHaveBeenCalledTimes(before + 1));
    stop();
  });
});
