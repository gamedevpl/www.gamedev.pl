import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../submissionApi.js', () => ({
  getSubmissionStatus: vi.fn(),
}));

import { getSubmissionStatus, type SubmissionApiError, type SubmissionStatus } from '../../submissionApi.js';
import { pokeStudioStatus, subscribeStudioStatus, type StudioStatusSubscriber } from './studioStatusStore.js';

const statusFixture = (overrides: Partial<SubmissionStatus> = {}): SubmissionStatus =>
  ({ status: 'building', ...overrides }) as SubmissionStatus;

function fixedSubscriber(intervalMs: number | null): StudioStatusSubscriber & {
  updates: SubmissionStatus[];
  errors: SubmissionApiError[];
} {
  const updates: SubmissionStatus[] = [];
  const errors: SubmissionApiError[] = [];
  return {
    intervalMs: () => intervalMs,
    onUpdate: (status) => updates.push(status),
    onError: (error) => errors.push(error),
    updates,
    errors,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getSubmissionStatus).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('subscribeStudioStatus', () => {
  it('fetches immediately for the first subscriber and delivers the result', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const sub = fixedSubscriber(10_000);

    const unsubscribe = subscribeStudioStatus(key, 'en', sub);
    await vi.waitFor(() => expect(sub.updates).toHaveLength(1));

    expect(getSubmissionStatus).toHaveBeenCalledWith(key, 'en');
    expect(sub.updates[0]).toEqual(statusFixture());
    unsubscribe();
  });

  it('shares one fetch across concurrent subscribers to the same key', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const a = fixedSubscriber(10_000);
    const b = fixedSubscriber(10_000);

    const unsubA = subscribeStudioStatus(key, 'en', a);
    const unsubB = subscribeStudioStatus(key, 'en', b);
    await vi.waitFor(() => {
      expect(a.updates).toHaveLength(1);
      expect(b.updates).toHaveLength(1);
    });

    expect(getSubmissionStatus).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });

  it('gives a later subscriber the already-known status synchronously', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const first = fixedSubscriber(10_000);
    const unsubFirst = subscribeStudioStatus(key, 'en', first);
    await vi.waitFor(() => expect(first.updates).toHaveLength(1));

    const second = fixedSubscriber(10_000);
    const unsubSecond = subscribeStudioStatus(key, 'en', second);

    // Delivered synchronously from cache — no extra fetch needed for it.
    expect(second.updates).toHaveLength(1);
    expect(getSubmissionStatus).toHaveBeenCalledTimes(1);
    unsubFirst();
    unsubSecond();
  });

  it('ticks again after the fastest interval any subscriber still wants', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const slow = fixedSubscriber(20_000);
    const fast = fixedSubscriber(5_000);

    const unsubSlow = subscribeStudioStatus(key, 'en', slow);
    const unsubFast = subscribeStudioStatus(key, 'en', fast);
    await vi.waitFor(() => expect(slow.updates).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(getSubmissionStatus).toHaveBeenCalledTimes(2);
    expect(slow.updates).toHaveLength(2);
    expect(fast.updates).toHaveLength(2);

    unsubSlow();
    unsubFast();
  });

  it('stops polling once every subscriber opts out, and a later opt-in resumes it', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture({ status: 'published' }));
    const key = `token-${Math.random()}`;
    const done = fixedSubscriber(null);

    const unsubDone = subscribeStudioStatus(key, 'en', done);
    await vi.waitFor(() => expect(done.updates).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(120_000);
    expect(getSubmissionStatus).toHaveBeenCalledTimes(1); // no further ticks scheduled

    const stillWatching = fixedSubscriber(10_000);
    subscribeStudioStatus(key, 'en', stillWatching);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getSubmissionStatus).toHaveBeenCalledTimes(2); // resumed, driven by the new subscriber

    unsubDone();
  });

  it('stops the timer once the last subscriber unsubscribes', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const sub = fixedSubscriber(5_000);

    const unsubscribe = subscribeStudioStatus(key, 'en', sub);
    await vi.waitFor(() => expect(sub.updates).toHaveLength(1));
    unsubscribe();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getSubmissionStatus).toHaveBeenCalledTimes(1);
  });

  it('reschedules using the remaining subscriber once one unsubscribes', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const fast = fixedSubscriber(3_000);
    const slow = fixedSubscriber(20_000);

    const unsubFast = subscribeStudioStatus(key, 'en', fast);
    const unsubSlow = subscribeStudioStatus(key, 'en', slow);
    await vi.waitFor(() => expect(fast.updates).toHaveLength(1));

    unsubFast();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(getSubmissionStatus).toHaveBeenCalledTimes(1); // the fast subscriber's cadence no longer applies

    await vi.advanceTimersByTimeAsync(17_000);
    expect(getSubmissionStatus).toHaveBeenCalledTimes(2); // the slow subscriber's own cadence still does

    unsubSlow();
  });

  it('delivers errors to onError and can still be driven back to polling', async () => {
    const error = Object.assign(new Error('boom'), { status: 500 }) as SubmissionApiError;
    vi.mocked(getSubmissionStatus).mockRejectedValue(error);
    const key = `token-${Math.random()}`;
    const sub = fixedSubscriber(5_000);

    const unsubscribe = subscribeStudioStatus(key, 'en', sub);
    await vi.waitFor(() => expect(sub.errors).toHaveLength(1));
    expect(sub.errors[0]).toBe(error);
    expect(sub.updates).toHaveLength(0);

    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(sub.updates).toHaveLength(1));

    unsubscribe();
  });

  it('lets a subscriber opt out only on error while another keeps polling', async () => {
    const error = Object.assign(new Error('bad token'), { status: 400 }) as SubmissionApiError;
    vi.mocked(getSubmissionStatus).mockRejectedValue(error);
    const key = `token-${Math.random()}`;
    const stopsOnError: StudioStatusSubscriber & { errors: SubmissionApiError[] } = {
      intervalMs: (_latest, err) => (err ? null : 5_000),
      onError: (err) => stopsOnError.errors.push(err),
      errors: [],
    };
    const keepsGoing = fixedSubscriber(5_000);

    const unsubA = subscribeStudioStatus(key, 'en', stopsOnError);
    const unsubB = subscribeStudioStatus(key, 'en', keepsGoing);
    await vi.waitFor(() => expect(keepsGoing.errors).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(getSubmissionStatus).toHaveBeenCalledTimes(2); // driven by keepsGoing alone

    unsubA();
    unsubB();
  });
});

describe('pokeStudioStatus', () => {
  it('forces an immediate refetch ahead of the scheduled tick', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const sub = fixedSubscriber(60_000);

    const unsubscribe = subscribeStudioStatus(key, 'en', sub);
    await vi.waitFor(() => expect(sub.updates).toHaveLength(1));

    pokeStudioStatus(key, 'en');
    await vi.waitFor(() => expect(sub.updates).toHaveLength(2));
    expect(getSubmissionStatus).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('does not schedule a duplicate tick after a poke', async () => {
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const sub = fixedSubscriber(10_000);

    const unsubscribe = subscribeStudioStatus(key, 'en', sub);
    await vi.waitFor(() => expect(sub.updates).toHaveLength(1));

    pokeStudioStatus(key, 'en');
    await vi.waitFor(() => expect(sub.updates).toHaveLength(2));

    // The pre-poke schedule must be superseded, not left to also fire.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sub.updates).toHaveLength(3);

    unsubscribe();
  });

  it('is a no-op when nothing is subscribed to that key', () => {
    expect(() => pokeStudioStatus(`unknown-${Math.random()}`, 'en')).not.toThrow();
    expect(getSubmissionStatus).not.toHaveBeenCalled();
  });
});
