import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../submissionApi.js', () => ({
  getSubmissionStatus: vi.fn(),
}));

import { getSubmissionStatus, type SubmissionApiError, type SubmissionStatus } from '../../submissionApi.js';
import { pokeStudioStatus, subscribeStudioStatus, type StudioStatusSubscriber } from './studioStatusStore.js';

const statusFixture = (overrides: Partial<SubmissionStatus> = {}): SubmissionStatus =>
  ({ status: 'building', ...overrides }) as SubmissionStatus;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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
    // The cached status is 120s stale, well past stillWatching's 10s budget,
    // so joining triggers an immediate catch-up poll rather than a fresh wait.
    await vi.waitFor(() => expect(stillWatching.updates).toHaveLength(1));
    expect(getSubmissionStatus).toHaveBeenCalledTimes(2);

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

  it('keeps the remaining subscriber on its original deadline after a mid-interval unsubscribe', async () => {
    // Regression: unsubscribing used to reschedule the survivor for a full
    // fresh interval starting at that moment, not from the last real tick —
    // repeated subscribe churn could push its poll later indefinitely.
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const fast = fixedSubscriber(3_000);
    const slow = fixedSubscriber(10_000);

    const unsubFast = subscribeStudioStatus(key, 'en', fast);
    const unsubSlow = subscribeStudioStatus(key, 'en', slow);
    await vi.waitFor(() => expect(slow.updates).toHaveLength(1));

    // Before fast's own 3s cadence would next fire, so this leaves only one
    // real tick so far — the elapsed-time bookkeeping is what's under test.
    await vi.advanceTimersByTimeAsync(2_000);
    unsubFast();

    // Reaches slow's original 10s deadline, not a fresh 10s post-unsubscribe.
    await vi.advanceTimersByTimeAsync(8_000);
    expect(getSubmissionStatus).toHaveBeenCalledTimes(2);
    expect(slow.updates).toHaveLength(2);

    unsubSlow();
  });

  it('never double-delivers when a subscriber joins while the first fetch is in flight', async () => {
    // Regression: a subscriber joining before the first fetch resolves used
    // to schedule its own timer alongside that in-flight fetch; if the timer
    // fired before the fetch resolved, both continuations delivered the
    // same resolved status to every subscriber.
    const d = deferred<SubmissionStatus>();
    vi.mocked(getSubmissionStatus).mockReturnValue(d.promise);
    const key = `token-${Math.random()}`;
    const first = fixedSubscriber(1_000); // short enough that a race would fire before resolution
    const second = fixedSubscriber(1_000);

    const unsubFirst = subscribeStudioStatus(key, 'en', first);
    await vi.advanceTimersByTimeAsync(1_000); // long enough for a stray timer to fire, were one scheduled
    const unsubSecond = subscribeStudioStatus(key, 'en', second);

    d.resolve(statusFixture());
    await vi.waitFor(() => expect(first.updates).toHaveLength(1));

    expect(first.updates).toHaveLength(1);
    expect(second.updates).toHaveLength(1);
    expect(getSubmissionStatus).toHaveBeenCalledTimes(1);

    unsubFirst();
    unsubSecond();
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

  it('keeps ticking and notifies the other subscribers when one onUpdate throws', async () => {
    // Regression: a throwing callback used to escape the tick uncaught,
    // skipping cleanup and leaving `ticking` stuck true — no subscriber,
    // old or new, would ever be polled again.
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const broken = fixedSubscriber(5_000);
    broken.onUpdate = () => {
      throw new Error('subscriber bug');
    };
    const healthy = fixedSubscriber(5_000);

    const unsubBroken = subscribeStudioStatus(key, 'en', broken);
    const unsubHealthy = subscribeStudioStatus(key, 'en', healthy);
    await vi.waitFor(() => expect(healthy.updates).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(healthy.updates).toHaveLength(2));
    expect(getSubmissionStatus).toHaveBeenCalledTimes(2);

    unsubBroken();
    unsubHealthy();
  });

  it('does not orphan a subscriber whose cached-value delivery throws', async () => {
    // Regression: a throwing callback here used to escape before the poll
    // was started/resumed below, orphaning the subscriber with no active tick.
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const first = fixedSubscriber(5_000);
    const unsubFirst = subscribeStudioStatus(key, 'en', first);
    await vi.waitFor(() => expect(first.updates).toHaveLength(1));
    unsubFirst(); // dormant now, but state.latest is still cached

    let thrown = false;
    const broken = fixedSubscriber(5_000);
    broken.onUpdate = (status) => {
      if (!thrown) {
        thrown = true;
        throw new Error('subscriber bug on cached delivery');
      }
      broken.updates.push(status);
    };

    expect(() => subscribeStudioStatus(key, 'en', broken)).not.toThrow();

    await vi.waitFor(() => expect(getSubmissionStatus).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(broken.updates).toHaveLength(1));
  });

  it('keeps scheduling for healthy subscribers when one cadence policy throws', async () => {
    // Regression: intervalMs throwing inside nextDelay used to propagate out
    // of schedule() (called from tick()'s finally), leaving no timer set and
    // silently stopping the poll for every subscriber, broken or not.
    vi.mocked(getSubmissionStatus).mockResolvedValue(statusFixture());
    const key = `token-${Math.random()}`;
    const broken: StudioStatusSubscriber = {
      intervalMs: () => {
        throw new Error('cadence bug');
      },
    };
    const healthy = fixedSubscriber(5_000);

    const unsubBroken = subscribeStudioStatus(key, 'en', broken);
    const unsubHealthy = subscribeStudioStatus(key, 'en', healthy);
    await vi.waitFor(() => expect(healthy.updates).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(healthy.updates).toHaveLength(2));
    expect(getSubmissionStatus).toHaveBeenCalledTimes(2);

    unsubBroken();
    unsubHealthy();
  });

  it('gives a late subscriber the freshest known error, not a stale success', async () => {
    // Regression: a success followed by an error left `latest` still set,
    // so a joining subscriber got the stale success instead of the error —
    // fatal for a subscriber whose cadence stops retrying on that error.
    const error = Object.assign(new Error('bad token'), { status: 400 }) as SubmissionApiError;
    vi.mocked(getSubmissionStatus).mockResolvedValueOnce(statusFixture()).mockRejectedValueOnce(error);
    const key = `token-${Math.random()}`;
    const first = fixedSubscriber(1_000);
    const unsubFirst = subscribeStudioStatus(key, 'en', first);
    await vi.waitFor(() => expect(first.updates).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(first.errors).toHaveLength(1));

    const late = fixedSubscriber(1_000);
    subscribeStudioStatus(key, 'en', late);

    expect(late.errors).toHaveLength(1);
    expect(late.updates).toHaveLength(0);

    unsubFirst();
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
