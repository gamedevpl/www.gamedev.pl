import { getSubmissionStatus, type SubmissionApiError, type SubmissionStatus } from '../../submissionApi.js';

/**
 * One shared poll per (token, locale) — replacing what were five independent
 * `setInterval`/`setTimeout` loops hitting the same `getSubmissionStatus`
 * endpoint. Each caller subscribes with its own cadence policy; the shared
 * loop ticks at the fastest cadence any current subscriber still wants, and
 * stops once none do. `core/dataLayer.ts`'s request dedup already collapses
 * near-simultaneous fetches — this collapses the *schedules* themselves.
 */
export interface StudioStatusSubscriber {
  /**
   * Delay in ms before the next poll, given the latest resolved status (or
   * the latest error). Return null to opt this subscriber out of scheduling
   * the next tick — the shared poll still runs if another subscriber wants it.
   */
  intervalMs(latest: SubmissionStatus | null, error: SubmissionApiError | null): number | null;
  /** Called with every resolved status, including one already cached from a prior subscriber. */
  onUpdate?(status: SubmissionStatus): void;
  onError?(error: SubmissionApiError): void;
}

interface PollState {
  token: string;
  locale: string;
  subscribers: Set<StudioStatusSubscriber>;
  latest: SubmissionStatus | null;
  lastError: SubmissionApiError | null;
  // When the last tick (success or error) completed — schedule() counts a
  // subscriber's own interval from here, not from whenever it happens to
  // run, or a subscribe/unsubscribe mid-interval would keep pushing the
  // remaining subscribers' next poll later.
  lastTickAt: number | undefined;
  // True from the moment a tick starts until it reschedules. A subscribe
  // while this is true must not schedule its own timer — that would let a
  // slow-resolving tick's late completion and this new timer both call
  // getSubmissionStatus and, though core/dataLayer.ts's dedup makes that one
  // request, both would still separately deliver it to every subscriber.
  ticking: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  // Bumped on every subscribe-from-zero and every poke; a scheduled tick
  // whose generation no longer matches was superseded and must not run.
  generation: number;
}

const polls = new Map<string, PollState>();

function keyFor(token: string, locale: string): string {
  return `${token}:${locale}`;
}

function nextDelay(state: PollState): number | null {
  let delay: number | null = null;
  for (const subscriber of state.subscribers) {
    const wanted = subscriber.intervalMs(state.latest, state.lastError);
    if (wanted === null) continue;
    if (delay === null || wanted < delay) delay = wanted;
  }
  return delay;
}

function schedule(key: string, state: PollState): void {
  if (state.timer !== undefined) clearTimeout(state.timer);
  const wanted = nextDelay(state);
  if (wanted === null) {
    state.timer = undefined;
    return;
  }
  const elapsed = state.lastTickAt === undefined ? 0 : Date.now() - state.lastTickAt;
  const delay = Math.max(0, wanted - elapsed);
  const generation = state.generation;
  state.timer = setTimeout(() => void tick(key, generation), delay);
}

async function tick(key: string, generation: number): Promise<void> {
  const state = polls.get(key);
  if (!state || state.generation !== generation) return;
  state.timer = undefined;
  state.ticking = true;
  try {
    const status = await getSubmissionStatus(state.token, state.locale);
    if (polls.get(key) !== state || state.generation !== generation) return;
    state.latest = status;
    state.lastError = null;
    for (const subscriber of state.subscribers) subscriber.onUpdate?.(status);
  } catch (err) {
    if (polls.get(key) !== state || state.generation !== generation) return;
    const apiError = err as SubmissionApiError;
    state.lastError = apiError;
    for (const subscriber of state.subscribers) subscriber.onError?.(apiError);
  }
  state.lastTickAt = Date.now();
  state.ticking = false;
  schedule(key, state);
}

/**
 * Joins the shared poll for `token`/`locale`. Fires an immediate fetch when
 * this is the first subscriber for that key; a later subscriber to an
 * already-active key gets the latest known status synchronously instead,
 * so mounting a second consumer never shows an empty state the first
 * consumer already resolved past.
 */
export function subscribeStudioStatus(token: string, locale: string, subscriber: StudioStatusSubscriber): () => void {
  const key = keyFor(token, locale);
  let state = polls.get(key);
  // True for a brand-new key, or one every prior subscriber has already left
  // (dormant: no subscribers, no timer) — either way nothing is polling yet.
  const isDormant = !state || (state.subscribers.size === 0 && state.timer === undefined);
  if (!state) {
    state = {
      token,
      locale,
      subscribers: new Set(),
      latest: null,
      lastError: null,
      lastTickAt: undefined,
      ticking: false,
      timer: undefined,
      generation: 0,
    };
    polls.set(key, state);
  }
  state.subscribers.add(subscriber);

  if (state.latest) subscriber.onUpdate?.(state.latest);
  else if (state.lastError) subscriber.onError?.(state.lastError);

  if (isDormant) {
    state.generation += 1;
    void tick(key, state.generation);
  } else if (!state.ticking) {
    // A tick already in flight will reschedule against the new subscriber
    // set itself once it completes — scheduling here too would race it.
    schedule(key, state);
  }

  return () => {
    const current = polls.get(key);
    if (!current) return;
    current.subscribers.delete(subscriber);
    if (current.subscribers.size === 0) {
      if (current.timer !== undefined) clearTimeout(current.timer);
      current.timer = undefined;
    } else if (!current.ticking) {
      schedule(key, current);
    }
  };
}

/**
 * Forces an immediate re-poll for `token`/`locale` — a visibility/focus
 * wake-up, or a caller that knows the status just changed server-side
 * (e.g. right after sealing) and doesn't want to wait out the cadence.
 * A no-op when nothing is currently subscribed to that key.
 */
export function pokeStudioStatus(token: string, locale: string): void {
  const key = keyFor(token, locale);
  const state = polls.get(key);
  if (!state || state.subscribers.size === 0) return;
  if (state.timer !== undefined) clearTimeout(state.timer);
  state.generation += 1;
  void tick(key, state.generation);
}
