import { getSubmissionStatus, type SubmissionApiError, type SubmissionStatus } from '../../submissionApi.js';

// One shared poll per (token, locale); each subscriber sets its own cadence.
export interface StudioStatusSubscriber {
  // ms until the next poll; return null to opt this subscriber out.
  intervalMs(latest: SubmissionStatus | null, error: SubmissionApiError | null): number | null;
  // Fires for every status, including one cached from an earlier subscriber.
  onUpdate?(status: SubmissionStatus): void;
  onError?(error: SubmissionApiError): void;
}

interface PollState {
  token: string;
  locale: string;
  subscribers: Set<StudioStatusSubscriber>;
  latest: SubmissionStatus | null;
  lastError: SubmissionApiError | null;
  // schedule() counts a subscriber's interval from here, not from call time.
  lastTickAt: number | undefined;
  // True mid-tick; a join then must not schedule its own timer.
  ticking: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  // Bumped by poke/resubscribe; a stale tick's generation must not run.
  generation: number;
}

const polls = new Map<string, PollState>();

function keyFor(token: string, locale: string): string {
  return `${token}:${locale}`;
}

function nextDelay(state: PollState): number | null {
  let delay: number | null = null;
  for (const subscriber of state.subscribers) {
    let wanted: number | null;
    try {
      wanted = subscriber.intervalMs(state.latest, state.lastError);
    } catch {
      continue; // a broken cadence policy must not block the others
    }
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

// True once a poke/resubscribe elsewhere already took over this generation.
function superseded(key: string, state: PollState, generation: number): boolean {
  return polls.get(key) !== state || state.generation !== generation;
}

async function tick(key: string, generation: number): Promise<void> {
  const state = polls.get(key);
  if (!state || state.generation !== generation) return;
  state.timer = undefined;
  state.ticking = true;

  let status: SubmissionStatus | undefined;
  let apiError: SubmissionApiError | undefined;
  try {
    status = await getSubmissionStatus(state.token, state.locale);
  } catch (err) {
    apiError = err as SubmissionApiError;
  }

  if (superseded(key, state, generation)) return;

  try {
    if (status !== undefined) {
      state.latest = status;
      state.lastError = null;
      // Snapshot avoids double-delivery to a subscriber added during this loop.
      for (const subscriber of [...state.subscribers]) {
        try {
          subscriber.onUpdate?.(status);
        } catch {
          // one subscriber's bug must not affect the others
        }
      }
    } else if (apiError !== undefined) {
      state.lastError = apiError;
      for (const subscriber of [...state.subscribers]) {
        try {
          subscriber.onError?.(apiError);
        } catch {
          // one subscriber's bug must not affect the others
        }
      }
    }
  } finally {
    // Skip cleanup if a reentrant poke already started a newer tick.
    if (!superseded(key, state, generation)) {
      state.lastTickAt = Date.now();
      state.ticking = false;
      schedule(key, state);
    }
  }
}

export interface SubscribeStudioStatusOptions {
  // Force a fresh tick when joining, even an already idle poll.
  forceFreshOnMount?: boolean;
}

// Joins the shared poll; a later subscriber gets the known status synchronously.
export function subscribeStudioStatus(
  token: string,
  locale: string,
  subscriber: StudioStatusSubscriber,
  options: SubscribeStudioStatusOptions = {},
): () => void {
  const key = keyFor(token, locale);
  let state = polls.get(key);
  // Dormant: a brand-new key, or one every subscriber already left.
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

  // A success clears lastError, so a non-null one is always fresher.
  try {
    if (state.lastError) subscriber.onError?.(state.lastError);
    else if (state.latest) subscriber.onUpdate?.(state.latest);
  } catch {
    // must not skip starting/resuming the poll below
  }

  if (isDormant || (options.forceFreshOnMount && !state.ticking)) {
    state.generation += 1;
    void tick(key, state.generation);
  } else if (!state.ticking) {
    schedule(key, state); // an in-flight tick will reschedule itself instead
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

// Forces an immediate re-poll; a no-op when nobody is subscribed.
export function pokeStudioStatus(token: string, locale: string): void {
  const key = keyFor(token, locale);
  const state = polls.get(key);
  if (!state || state.subscribers.size === 0) return;
  if (state.timer !== undefined) clearTimeout(state.timer);
  state.generation += 1;
  void tick(key, state.generation);
}
