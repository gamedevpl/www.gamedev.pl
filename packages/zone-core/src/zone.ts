import {
  canonicalize,
  checksumState,
  MAX_STATE_BYTES,
  MAX_TICK_MS,
  ZONE_SNAPSHOT_VERSION,
  type TickHz,
  type ZoneEvent,
  type ZoneSnapshot,
} from './contract.js';
import { isSimTimeoutError, type SimCage, type SimInstance } from './cage.js';
import { validateZoneInput, type ZoneSchema } from './schema.js';

/**
 * One authoritative zone: a live simulation, the players in it, and its life cycle
 * between Firestore and memory (docs/persistent-world-plan.md P3,
 * docs/p3-zone-host-infra.md §4).
 *
 * The zone does not own a timer. `pump(now)` runs whatever whole ticks are due, and the
 * host drives every zone from one interval — one timer per instance rather than one per
 * zone, which is both cheaper and what makes this class testable by handing it times
 * instead of waiting for them.
 *
 * Three properties are load-bearing and none of them are obvious:
 *
 * 1. **A zone with nobody in it stops existing.** Not "ticks more slowly" — stops. The
 *    last player leaving takes a final snapshot, disposes the cage and drops the state.
 *    That is what makes the instance drain and the bill go to zero, so it is a
 *    correctness property of the cost model rather than a tidiness one.
 * 2. **Waking is a rewind, not a restart.** The generator's position is not in the
 *    state, so a snapshot records how many numbers have been drawn and a restore
 *    replays exactly that many before handing the stream back.
 * 3. **Budgets are enforced here, not only in CI.** Check 23 proves a sim *can* run in
 *    8 ms on a build machine. This is what happens when it does not on a real one, with
 *    fifteen other zones on the same core.
 */

/** How often a delta carries a state checksum, in ticks. Once a second at any tick rate. */
const CHECKPOINT_EVERY_SECONDS = 1;

/** How often a live zone writes itself to Firestore. Also the bound on loss if the
 *  instance dies without warning — an unscheduled hibernate costs at most this much. */
export const SNAPSHOT_EVERY_MS = 30_000;

// Emptied zones stay in memory this long; docs/p3-zone-host-infra.md §4.
export const PARK_GRACE_MS = 60_000;

/**
 * Ticks that may run over budget before the zone is put to sleep.
 *
 * Not zero, because one slow tick is a garbage collection or a noisy neighbour and
 * killing a world for it would be its own outage. Not unbounded, because the promise
 * this host makes to every *other* zone on the instance is that no single one can eat
 * the core. Twenty overruns inside a hundred ticks is a sim that is genuinely too
 * expensive rather than one that had a bad moment.
 */
const OVERRUN_WINDOW_TICKS = 100;
const OVERRUN_LIMIT = 20;

/** Events one player may have waiting for a single tick. Beyond this they are dropped:
 *  a tick's event list is meant to be a handful of intents, not a queue to flush. */
const MAX_PENDING_PER_SLOT = 8;

/**
 * Interrupt ceiling for a tick — the zone running. Headroom over `MAX_TICK_MS` so one GC
 * pause is not a zone death; still short enough that a runaway tick cannot eat the core.
 */
const SIM_CALL_TIMEOUT_MS = Math.max(MAX_TICK_MS * 8, 200);

/**
 * Interrupt ceiling for a zone coming up: building the realm, then `init` / `restore` /
 * `wake`.
 *
 * Deliberately *not* derived from `MAX_TICK_MS`, and deliberately one number rather than
 * one per call. A6 fired three times on the same fault before the shape of it was read
 * correctly — wake moved off the per-tick budget on 2026-08-02, load on 2026-08-05, and on
 * 2026-08-06 the timeout came back in `restore`, the next call still priced per-frame.
 * Each fix was right about its own call and wrong about the problem.
 *
 * What the stacks were saying: across five timeouts the interrupt landed in `sin`, `cos`,
 * `reduce`, `loadSim` and `nextRandom` — five unrelated leaf functions, none of them slow.
 * `biplane-skirmish` blew 200 ms restoring 167 draws of a 1.2 KB state, which is
 * microseconds of work. These ceilings are wall-clock and `isolated-vm` runs the sim on
 * its own thread; on a 1-CPU instance that thread competes with the games-repo fetch, the
 * Firestore read and GC on the main one, so a descheduled isolate spends the budget
 * without executing. Widening one call only moves the loss to the next narrowest.
 *
 * Seconds are cheap here because this happens once per join and nothing waits on it but
 * that join. The tick budget above is the one holding the actual safety property, and it
 * is untouched: by tick time the zone is live and the instance is warm.
 */
const SIM_STARTUP_TIMEOUT_MS = 5_000;

export type ZoneStatus = 'sleeping' | 'live' | 'parked' | 'closed';

export interface ZoneSnapshotStore {
  load(zoneId: string): Promise<ZoneSnapshot | null>;
  save(zoneId: string, snapshot: ZoneSnapshot): Promise<void>;
}

/** A game's simulation, as the host obtains it. Null when the game ships none. */
export interface SimSource {
  load(slug: string): Promise<{ bundleJs: string; simMathJs: string } | null>;
}

export type ZoneOutboundFrame =
  | { t: 'snap'; tick: number; seed: number; draws: number; state: string }
  | { t: 'delta'; tick: number; ev: ZoneEvent[]; h?: string }
  | { t: 'closed'; reason: string };

export type ZoneWarnEvent = {
  kind: 'wake_catchup_skipped';
  slug: string;
  zoneId: string;
  elapsedMs: number;
  error: unknown;
};

export interface ZoneOptions {
  id: string;
  slug: string;
  schema: ZoneSchema;
  cage: SimCage;
  source: SimSource;
  store: ZoneSnapshotStore;
  /** Sent to every seated player. The host maps this onto sockets. */
  broadcast: (frame: ZoneOutboundFrame) => void;
  /** Sent to one player, for a join snapshot or a resync. */
  sendTo: (slot: number, frame: ZoneOutboundFrame) => void;
  now?: () => number;
  /**
   * Wall-clock reading used only to meter a tick.
   *
   * Separate from `now` on purpose, and the separation is not cosmetic: `now` is the
   * zone's logical clock — what schedules ticks and stamps snapshots — and a test drives
   * it in fixed jumps. Metering has to read the clock that actually moved while the sim
   * was running, or a budget check measures the schedule instead of the work and passes
   * for every sim ever written.
   */
  monotonicMs?: () => number;
  /** Seed for a zone that has never existed. Injected so a test can pin a world. */
  newSeed?: () => number;
  memoryMb?: number;
  /**
   * Soft faults the zone chose to survive. Wake catch-up that blows its budget is the
   * current one: refusing the join would fall the shell back to solo play and fire A6,
   * which is worse than opening on the last snapshot without the missed minutes.
   */
  onWarn?: (event: ZoneWarnEvent) => void;
}

export class ZoneFullError extends Error {}
export class ZoneUnavailableError extends Error {}

export class Zone {
  readonly id: string;
  readonly slug: string;
  readonly tickHz: TickHz;
  readonly maxPlayers: number;

  private readonly options: ZoneOptions;
  private readonly now: () => number;
  private readonly monotonicMs: () => number;
  private readonly tickMs: number;

  private sim: SimInstance | null = null;
  private status: ZoneStatus = 'sleeping';
  private seed = 0;
  private tick = 0;
  /** Slot → the player's pseudonymous tag, for the roster and for reclaiming a seat. */
  private readonly seats = new Map<number, string>();
  private pending: ZoneEvent[] = [];
  private accumulatorMs = 0;
  private lastPumpAt = 0;
  private lastSnapshotAt = 0;
  // When the last player left, while the world is still held.
  private parkedAt = 0;
  private recentOverruns: number[] = [];
  /** Set while a wake is in flight, so two arrivals cannot each start one. */
  private waking: Promise<void> | null = null;

  constructor(options: ZoneOptions) {
    this.options = options;
    this.id = options.id;
    this.slug = options.slug;
    this.tickHz = options.schema.tickHz;
    this.maxPlayers = options.schema.maxPlayers;
    this.now = options.now ?? Date.now;
    this.monotonicMs = options.monotonicMs ?? (() => performance.now());
    this.tickMs = 1000 / this.tickHz;
  }

  get state(): ZoneStatus {
    return this.status;
  }

  get playerCount(): number {
    return this.seats.size;
  }

  // Zero unless parked.
  get parkedSince(): number {
    return this.status === 'parked' ? this.parkedAt : 0;
  }

  get currentTick(): number {
    return this.tick;
  }

  roster(): Array<{ slot: number; nick: string | null }> {
    return [...this.seats.keys()].sort((a, b) => a - b).map((slot) => ({ slot, nick: null }));
  }

  /**
   * Seats a player, waking the zone if it was asleep.
   *
   * A returning player reclaims the seat their tag last held rather than taking the
   * lowest free one, which is what makes closing a tab and coming back put a character
   * where it was standing instead of spawning a stranger beside it.
   */
  async join(playerTag: string): Promise<number> {
    if (this.status === 'closed') throw new ZoneUnavailableError('zone is closed');

    const existing = [...this.seats.entries()].find(([, tag]) => tag === playerTag);
    if (existing) {
      await this.ensureLive();
      return existing[0];
    }

    if (this.seats.size >= this.maxPlayers) throw new ZoneFullError('zone is full');

    let slot = 0;
    while (this.seats.has(slot)) slot += 1;
    this.seats.set(slot, playerTag);

    try {
      await this.ensureLive();
    } catch (error) {
      this.seats.delete(slot);
      throw error;
    }

    // The sim hears about the arrival through the same ordered stream as everything
    // else, rather than through a side channel that could be applied out of order.
    this.pending.push({ slot, k: 'join' });
    return slot;
  }

  /** Retires a seat. When it was the last one, the zone parks rather than idling. */
  leave(slot: number): void {
    if (!this.seats.delete(slot)) return;
    if (this.status === 'live') this.pending.push({ slot, k: 'leave' });
    if (this.seats.size === 0) void this.park();
  }

  // Snapshot now, as hibernation did; keep the sim so a return skips the reload.
  private async park(): Promise<void> {
    if (this.status !== 'live') return;
    try {
      await this.persist();
    } catch {
      // Same loss bound as a failed periodic write.
    }
    if (this.status !== 'live') return;
    this.status = 'parked';
    this.parkedAt = this.now();
    this.pending = [];
    this.accumulatorMs = 0;
    this.lastPumpAt = 0;
  }

  /**
   * Queues one client input for the next tick, after checking it against the game's
   * declared vocabulary.
   *
   * This is the server edge of "the server accepts nothing outside what was declared".
   * The shell checks the same thing, and that is not redundancy — a modified client does
   * not run the shell's copy, so this is the check that counts.
   */
  enqueue(slot: number, kind: string, value: unknown): boolean {
    if (this.status !== 'live' || !this.seats.has(slot)) return false;
    if (this.pending.filter((event) => event.slot === slot).length >= MAX_PENDING_PER_SLOT) return false;

    const valid = validateZoneInput(this.options.schema, kind, value);
    if (!valid) return false;
    // The slot is attached here and nowhere else. A client never names its own, which is
    // what stops one player acting as another.
    this.pending.push(valid.v === undefined ? { slot, k: valid.k } : { slot, k: valid.k, v: valid.v });
    return true;
  }

  /**
   * Sends one player the authoritative state.
   *
   * The same call serves an arrival and a client that says it has lost the thread,
   * because they want the same thing — the world as it is right now, plus the generator
   * position to predict from. It is deliberately *not* folded into `join`: the caller
   * has to have finished seating the connection before a frame aimed at that seat can
   * reach it, and doing it inside `join` sent the opening snapshot into a seat the host
   * had not registered yet. Every arrival got a welcome and then silence.
   */
  snapshotTo(slot: number): void {
    if (this.status !== 'live' || !this.sim || !this.seats.has(slot)) return;
    try {
      const { state, draws } = this.sim.snapshot();
      this.options.sendTo(slot, { t: 'snap', tick: this.tick, seed: this.seed, draws, state });
    } catch (error) {
      // A world that cannot be serialized cannot be joined either — there is nothing to
      // hand the arriving player. Stopping is better than seating them in front of a
      // zone they will never receive.
      void this.fail(describeStateProblem(error));
    }
  }

  /**
   * Runs whatever whole ticks are due.
   *
   * The accumulator is bounded: a host that was blocked for a second does not then run
   * ten ticks back to back, because the sim would apply a second of fire spread in one
   * frame and every client would have to rewind through it. Falling behind is caught up
   * to a point and then simply forgiven — the world is authoritative, not punctual.
   */
  pump(now: number = this.now()): void {
    if (this.status === 'parked' && now - this.parkedAt >= PARK_GRACE_MS) {
      void this.hibernate('empty');
      return;
    }
    if (this.status !== 'live' || !this.sim) return;

    if (this.lastPumpAt === 0) this.lastPumpAt = now;
    this.accumulatorMs += Math.max(0, now - this.lastPumpAt);
    this.lastPumpAt = now;
    if (this.accumulatorMs > this.tickMs * 8) this.accumulatorMs = this.tickMs * 8;

    while (this.accumulatorMs >= this.tickMs && this.status === 'live') {
      this.accumulatorMs -= this.tickMs;
      if (!this.runOneTick()) return;
    }

    if (now - this.lastSnapshotAt >= SNAPSHOT_EVERY_MS) {
      this.lastSnapshotAt = now;
      void this.persist().catch(() => {
        // A snapshot that failed is not a reason to stop a world people are playing in.
        // The next one is thirty seconds away, and the loss bound is unchanged: an
        // instance dying costs the time since the last *successful* write.
      });
    }
  }

  private runOneTick(): boolean {
    const events = this.pending;
    this.pending = [];

    const started = this.monotonicMs();
    try {
      this.sim!.tick(events);
    } catch (error) {
      // A sim that throws mid-tick has left its world in a shape nobody can reason
      // about. Hibernating restores the last snapshot that was known good rather than
      // broadcasting whatever half-applied state came out.
      void this.fail(`sim threw during tick: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    const elapsed = this.monotonicMs() - started;
    this.tick += 1;

    if (!this.recordTickCost(elapsed)) return false;

    const checkpointEvery = Math.max(1, Math.round(this.tickHz * CHECKPOINT_EVERY_SECONDS));
    if (this.tick % checkpointEvery === 0) {
      const checkpoint = this.measure();
      if (!checkpoint) return false;
      this.options.broadcast({ t: 'delta', tick: this.tick, ev: events, h: checkpoint });
      return true;
    }

    this.options.broadcast({ t: 'delta', tick: this.tick, ev: events });
    return true;
  }

  /**
   * Counts a tick against the budget and puts the zone to sleep if it keeps missing.
   *
   * "Hibernated with prejudice" is a real outcome rather than a figure of speech: the
   * players are told, the last good snapshot stands, and the instance gets its core
   * back. A zone that cannot afford its own tick rate is a zone the platform declines
   * to subsidise out of every other world on the box.
   */
  private recordTickCost(elapsedMs: number): boolean {
    if (elapsedMs <= MAX_TICK_MS) {
      if (this.recentOverruns.length > 0 && this.tick - this.recentOverruns[0] > OVERRUN_WINDOW_TICKS) {
        this.recentOverruns = this.recentOverruns.filter((at) => this.tick - at <= OVERRUN_WINDOW_TICKS);
      }
      return true;
    }

    this.recentOverruns.push(this.tick);
    this.recentOverruns = this.recentOverruns.filter((at) => this.tick - at <= OVERRUN_WINDOW_TICKS);
    if (this.recentOverruns.length < OVERRUN_LIMIT) return true;

    void this.fail(
      `zone exceeded the ${MAX_TICK_MS} ms tick budget on ${this.recentOverruns.length} of the last ` +
        `${OVERRUN_WINDOW_TICKS} ticks`,
    );
    return false;
  }

  /**
   * Measures the state and returns its checksum, or closes the zone if it has outgrown
   * the snapshot ceiling.
   *
   * Run once a second rather than every tick, because canonicalizing a world costs about
   * what ticking it does and a size that creeps up over a minute is caught just as well
   * by looking once a second. The ceiling itself is not a tidiness rule: a state past it
   * cannot be written to Firestore at all, so a zone that crossed it would run happily
   * until the moment it tried to sleep and then lose everything.
   */
  private measure(): string | null {
    let canonical: string;
    try {
      // Throws when the world holds something JSON would rewrite rather than refuse —
      // see `__zoneState` in the bootstrap for why that check cannot live out here.
      canonical = canonicalize(JSON.parse(this.sim!.snapshot().state));
    } catch (error) {
      void this.fail(describeStateProblem(error));
      return null;
    }

    const bytes = Buffer.byteLength(canonical, 'utf8');
    if (bytes > MAX_STATE_BYTES) {
      void this.fail(`zone state reached ${bytes} bytes, over the ${MAX_STATE_BYTES} byte snapshot ceiling`);
      return null;
    }

    return checksumState(canonical);
  }

  /** Loads or wakes the simulation, at most once however many players arrive together. */
  private async ensureLive(): Promise<void> {
    if (this.status === 'live') return;
    if (this.waking) return this.waking;

    this.waking = this.wakeUp().finally(() => {
      this.waking = null;
    });
    return this.waking;
  }

  private async wakeUp(): Promise<void> {
    if (this.status === 'parked' && this.sim && (await this.wakeFromMemory())) return;

    const sources = await this.options.source.load(this.slug);
    if (!sources) throw new ZoneUnavailableError(`no simulation is published for ${this.slug}`);

    const loadSim = () =>
      this.options.cage.load({
        bundleJs: sources.bundleJs,
        simMathJs: sources.simMathJs,
        timeoutMs: SIM_CALL_TIMEOUT_MS,
        startupTimeoutMs: SIM_STARTUP_TIMEOUT_MS,
        memoryMb: this.options.memoryMb ?? 64,
      });

    let sim = await loadSim();
    const stored = await this.options.store.load(this.id);
    const now = this.now();

    if (stored && stored.version === ZONE_SNAPSHOT_VERSION) {
      this.seed = stored.seed;
      this.tick = stored.tick;
      sim.restore(stored.seed, stored.state, stored.draws);
      // The world does not politely pause because the last watcher logged off. How much
      // of the elapsed time actually applies is the *game's* decision — the platform
      // hands over real milliseconds and bounds only how long deciding may take.
      const elapsed = Math.max(0, now - stored.savedAt);
      if (elapsed > 0) {
        try {
          sim.wake(elapsed);
        } catch (error) {
          if (!isSimTimeoutError(error)) throw error;
          // A timed-out wake may have left the isolate mid-mutation. Rebuild from the
          // same snapshot and open without catch-up rather than refuse the join: the
          // shell's fallback is silent solo play, which looks healthy and is wrong.
          sim.dispose();
          sim = await loadSim();
          sim.restore(stored.seed, stored.state, stored.draws);
          this.options.onWarn?.({
            kind: 'wake_catchup_skipped',
            slug: this.slug,
            zoneId: this.id,
            elapsedMs: elapsed,
            error,
          });
        }
      }
    } else {
      this.seed = (this.options.newSeed ?? defaultSeed)();
      this.tick = 0;
      sim.init(this.seed);
    }

    this.sim = sim;
    this.status = 'live';
    this.accumulatorMs = 0;
    this.lastPumpAt = now;
    this.lastSnapshotAt = now;
    this.recentOverruns = [];
    this.pending = [];
  }

  // Memory holds exactly the park snapshot; only the catch-up is owed.
  private async wakeFromMemory(): Promise<boolean> {
    const sim = this.sim!;
    const now = this.now();
    const elapsed = Math.max(0, now - this.parkedAt);
    if (elapsed > 0) {
      try {
        sim.wake(elapsed);
      } catch (error) {
        if (!isSimTimeoutError(error)) throw error;
        // Fall through to the cold path, which rebuilds from that same snapshot.
        sim.dispose();
        this.sim = null;
        this.status = 'sleeping';
        return false;
      }
    }
    this.status = 'live';
    this.accumulatorMs = 0;
    this.lastPumpAt = now;
    this.lastSnapshotAt = now;
    this.recentOverruns = [];
    this.pending = [];
    return true;
  }

  /** Writes the zone to Firestore. Refuses a state that JSON would mangle on the way back. */
  private async persist(): Promise<void> {
    if (!this.sim) return;

    let state: string;
    let draws: number;
    try {
      ({ state, draws } = this.sim.snapshot());
    } catch (error) {
      // Storing a state JSON cannot carry would produce a world that silently changes
      // shape the first time this zone woke up, which is worse than not storing it. So
      // the zone stops here, while the last good snapshot is still the one on disk.
      await this.fail(describeStateProblem(error));
      return;
    }

    await this.options.store.save(this.id, {
      version: ZONE_SNAPSHOT_VERSION,
      seed: this.seed,
      tick: this.tick,
      draws,
      state,
      savedAt: this.now(),
    });
  }

  /**
   * Puts the zone to sleep: last snapshot, cage released, state forgotten.
   *
   * This is the step the cost model rests on. Nothing keeps ticking, no timer survives,
   * and when the last zone on an instance gets here the last socket closes and Cloud Run
   * drains it. An empty zone is one Firestore document.
   */
  async hibernate(reason: string): Promise<void> {
    // Parked: snapshot already written, nothing ticked since, nobody to tell.
    if (this.status === 'parked') {
      this.teardown();
      return;
    }
    if (this.status !== 'live') return;
    try {
      await this.persist();
    } catch {
      // Losing the final write costs the seconds since the last periodic one, which is
      // exactly the bound an unscheduled hibernate already carries. Not a reason to keep
      // an instance alive.
    }
    this.teardown();
    if (reason !== 'empty') this.options.broadcast({ t: 'closed', reason });
  }

  /** Hibernation the zone did not choose: a budget miss, a throw, an unstorable world. */
  private async fail(reason: string): Promise<void> {
    if (this.status !== 'live') return;
    this.status = 'sleeping';
    this.teardown();
    this.options.broadcast({ t: 'closed', reason: 'zone_stopped' });
    this.lastFailure = reason;
  }

  /** Why the zone last stopped itself, for the host's log. Never sent to a client. */
  lastFailure: string | null = null;

  private teardown(): void {
    this.sim?.dispose();
    this.sim = null;
    this.status = 'sleeping';
    this.pending = [];
    this.accumulatorMs = 0;
    this.lastPumpAt = 0;
    this.parkedAt = 0;
  }

  /** Retires the zone for good — the host is shutting down or evicting it. */
  async close(reason: string): Promise<void> {
    await this.hibernate(reason);
    this.status = 'closed';
    this.seats.clear();
  }
}

/**
 * Turns a realm-side storability failure into the sentence an author needs.
 *
 * The bootstrap marks these with an `UNSTORABLE:` prefix because they arrive as an
 * ordinary Error across the isolate boundary and would otherwise be indistinguishable
 * from a sim that threw for its own reasons.
 */
function describeStateProblem(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Searched rather than matched at the start: both cages wrap a realm-side throw before
  // it reaches here (`Error: ...`), and isolated-vm marshals it across a boundary as
  // well, so the marker travels inside the message rather than at the front of it.
  const marker = message.indexOf('UNSTORABLE:');
  return marker === -1
    ? `zone state could not be read: ${message}`
    : `zone state cannot be snapshotted: ${message.slice(marker + 'UNSTORABLE:'.length).trim()}`;
}

function defaultSeed(): number {
  return (Math.random() * 0x7fffffff) >>> 0;
}
