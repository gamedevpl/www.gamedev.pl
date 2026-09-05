import {
  verifyZoneTicket,
  Zone,
  ZoneFullError,
  type SimCage,
  type SimSource,
  type ZoneOutboundFrame,
  type ZoneSchema,
  type ZoneSnapshotStore,
} from '@gamedevpl/zone-core';

/**
 * The zone host: every live zone on this instance, and the one timer that drives them.
 *
 * One interval for the whole process rather than one per zone. That is cheaper, but the
 * reason it is written this way is that it makes "how many zones can this instance
 * afford?" a question with an answer — the pump measures how long a full sweep takes,
 * and a sweep that stops fitting inside a tick period is the signal that the instance is
 * full. A zone with its own timer would just quietly make every other zone late.
 *
 * The host holds no player identity. A ticket arrives carrying a per-zone pseudonym, the
 * seat is bound to that, and nothing here knows or could learn who it belongs to
 * (docs/p3-zone-protocol.md §2).
 */

/** How often the sweep runs. Finer than the fastest tick period (20 Hz = 50 ms) so a
 *  zone's ticks land close to on time without the sweep itself being a busy loop. */
const SWEEP_MS = 20;

/** Zones held on one instance before new ones are refused.
 *
 *  A refusal is a zone that does not open; admitting it anyway would degrade every zone
 *  already running, and a host that gets slower for everyone under load is harder to
 *  operate than one that says no. The number comes from the budget: 16 zones × 8 ms is
 *  128 ms of work per second at 10 Hz, comfortably inside one core with room for the
 *  sockets. */
export const MAX_ZONES_PER_INSTANCE = 16;

/**
 * A frame the host sends to one connection but a zone never originates: the seat
 * assignment that answers a hello. Kept out of `ZoneOutboundFrame` because a zone does
 * not know about connections — it knows about slots.
 */
export interface ZoneWelcomeFrame {
  t: 'welcome';
  slot: number;
  zone: string;
  slug: string;
  tickHz: number;
  maxPlayers: number;
}

export interface ZoneConnection {
  send(frame: ZoneOutboundFrame | ZoneWelcomeFrame): void;
  close(reason: string): void;
}

export interface ZoneHostOptions {
  cage: SimCage;
  source: SimSource;
  store: ZoneSnapshotStore;
  /** Resolves a slug's declaration, or null when it declares no zone. */
  schemas: { getSchema(slug: string): Promise<ZoneSchema | null> };
  secret: string;
  now?: () => number;
  maxZones?: number;
  /** Soft faults a zone chose to survive (e.g. wake catch-up skipped after a timeout). */
  onWarn?: (event: {
    kind: 'wake_catchup_skipped';
    slug: string;
    zoneId: string;
    elapsedMs: number;
    error: unknown;
  }) => void;
}

interface Seated {
  zone: Zone;
  slot: number;
  connection: ZoneConnection;
}

export class ZoneHost {
  private readonly zones = new Map<string, Zone>();
  private readonly members = new Map<string, Set<Seated>>();
  /**
   * Admissions in flight, per zone.
   *
   * A joining player holds no seat yet — `zone.join` has to load the sim and read the
   * snapshot first, and that await is hundreds of milliseconds of network. For all of it
   * the zone is not live and has nobody in it, which is precisely the shape the sweep
   * reaps. It ran every 20 ms, so it did not lose a race, it won every one: the zone and
   * its seat set were deleted out from under the very first join, which then failed on a
   * missing seat set and reported the generic `zone_unavailable`. Reaping mid-admission is
   * worse than the crash it caused, too — a second arrival would build a *second* Zone for
   * the same id, and two sims of one world in one process is the thing max-instances 1
   * exists to prevent.
   */
  private readonly admitting = new Map<string, number>();
  private readonly options: ZoneHostOptions;
  private readonly now: () => number;
  private readonly maxZones: number;
  private sweep: ReturnType<typeof setInterval> | null = null;

  constructor(options: ZoneHostOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.maxZones = options.maxZones ?? MAX_ZONES_PER_INSTANCE;
  }

  get liveZoneCount(): number {
    return [...this.zones.values()].filter((zone) => zone.state === 'live').length;
  }

  // Live and parked; a slept zone awaiting the sweep is not held.
  get heldZoneCount(): number {
    return [...this.zones.values()].filter((zone) => zone.state === 'live' || zone.state === 'parked').length;
  }

  start(): void {
    if (this.sweep) return;
    this.sweep = setInterval(() => this.pump(), SWEEP_MS);
    // Cloud Run counts an instance as busy while anything is scheduled. A sweep that
    // pinned the event loop would keep an instance alive with no zones on it, which is
    // the one thing the cost model cannot survive — so the timer does not hold the
    // process open by itself.
    this.sweep.unref?.();
  }

  pump(at: number = this.now()): void {
    for (const [zoneId, zone] of this.zones) {
      zone.pump(at);
      // A zone that put itself to sleep — empty, or over budget — is dropped here rather
      // than lingering as an object the next join would find in a half state.
      // A parked one is held on purpose: the next arrival skips the reload.
      if (
        zone.state !== 'live' &&
        zone.state !== 'parked' &&
        (this.members.get(zoneId)?.size ?? 0) === 0 &&
        !this.admitting.has(zoneId)
      ) {
        this.zones.delete(zoneId);
        this.members.delete(zoneId);
      }
    }
  }

  // A parked zone never outranks a player who wants to open one.
  private async evictParked(): Promise<boolean> {
    let oldest: { zoneId: string; zone: Zone } | null = null;
    for (const [zoneId, zone] of this.zones) {
      if (zone.state !== 'parked' || (this.members.get(zoneId)?.size ?? 0) > 0 || this.admitting.has(zoneId)) continue;
      if (!oldest || zone.parkedSince < oldest.zone.parkedSince) oldest = { zoneId, zone };
    }
    if (!oldest) return false;
    // Unregistered before the await: a rejoin racing this must build a fresh zone.
    this.zones.delete(oldest.zoneId);
    this.members.delete(oldest.zoneId);
    await oldest.zone.hibernate('evicted');
    return true;
  }

  /**
   * Admits one connection against a ticket.
   *
   * The ticket is the only thing consulted. There is no session here and there could not
   * be — the host is a separate origin and the cookie never reaches it — which is
   * exactly the property that keeps a place running untrusted code away from anything
   * that identifies a person.
   */
  async admit(ticket: string, connection: ZoneConnection): Promise<{ zoneId: string; slot: number; zone: Zone }> {
    const claims = verifyZoneTicket(ticket, this.options.secret, this.now());

    // Named on every refusal past this point, and nowhere near `claims.player`: which game
    // and which world is the whole question when a join fails, and neither says who.
    const named = { slug: claims.slug, zoneId: claims.zone };

    const schema = await this.options.schemas.getSchema(claims.slug);
    if (!schema) throw new ZoneAdmissionError('zone_not_found', named);

    let zone = this.zones.get(claims.zone);
    if (!zone) {
      if (this.zones.size >= this.maxZones && !(await this.evictParked())) {
        throw new ZoneAdmissionError('host_full', named);
      }
      zone = new Zone({
        id: claims.zone,
        slug: claims.slug,
        schema,
        cage: this.options.cage,
        source: this.options.source,
        store: this.options.store,
        broadcast: (frame) => this.broadcast(claims.zone, frame),
        sendTo: (slot, frame) => this.sendTo(claims.zone, slot, frame),
        now: this.now,
        onWarn: this.options.onWarn,
      });
      this.zones.set(claims.zone, zone);
      this.members.set(claims.zone, new Set());
    }

    let slot: number;
    this.admitting.set(claims.zone, (this.admitting.get(claims.zone) ?? 0) + 1);
    try {
      slot = await zone.join(claims.player);
    } catch (error) {
      if (
        this.zones.get(claims.zone) === zone &&
        (this.members.get(claims.zone)?.size ?? 0) === 0 &&
        (this.admitting.get(claims.zone) ?? 0) <= 1
      ) {
        this.zones.delete(claims.zone);
        this.members.delete(claims.zone);
      }
      if (error instanceof ZoneFullError) throw new ZoneAdmissionError('zone_full', { ...named, cause: error });
      throw new ZoneAdmissionError('zone_unavailable', { ...named, cause: error });
    } finally {
      const pending = (this.admitting.get(claims.zone) ?? 1) - 1;
      if (pending > 0) this.admitting.set(claims.zone, pending);
      else this.admitting.delete(claims.zone);
    }

    // A second connection for one seat replaces the first. A player with two tabs is one
    // player; letting both drive would make the world act on contradictory intents from
    // somebody who only meant one of them.
    // Derived state, so a missing set is rebuilt rather than thrown over: the seat this
    // player just earned is the fact, and `members` is only the index of it.
    const seats = this.members.get(claims.zone) ?? new Set<Seated>();
    this.members.set(claims.zone, seats);
    for (const seated of [...seats]) {
      if (seated.slot === slot) {
        seats.delete(seated);
        seated.connection.close('replaced');
      }
    }
    seats.add({ zone, slot, connection });
    // Only now — the frame is aimed at a seat, and the seat has to be reachable before
    // anything is aimed at it.
    zone.snapshotTo(slot);

    return { zoneId: claims.zone, slot, zone };
  }

  input(zoneId: string, slot: number, kind: string, value: unknown): void {
    this.zones.get(zoneId)?.enqueue(slot, kind, value);
  }

  resync(zoneId: string, slot: number): void {
    this.zones.get(zoneId)?.snapshotTo(slot);
  }

  release(zoneId: string, slot: number, connection: ZoneConnection): void {
    const seats = this.members.get(zoneId);
    if (!seats) return;
    for (const seated of [...seats]) {
      if (seated.slot === slot && seated.connection === connection) seats.delete(seated);
    }
    // Only when nothing else is holding the seat: a reconnect that raced the old
    // socket's close must not take the seat away from the connection that just claimed it.
    if (![...seats].some((seated) => seated.slot === slot)) {
      this.zones.get(zoneId)?.leave(slot);
    }
  }

  private broadcast(zoneId: string, frame: ZoneOutboundFrame): void {
    for (const seated of this.members.get(zoneId) ?? []) seated.connection.send(frame);
  }

  private sendTo(zoneId: string, slot: number, frame: ZoneOutboundFrame): void {
    for (const seated of this.members.get(zoneId) ?? []) {
      if (seated.slot === slot) seated.connection.send(frame);
    }
  }

  /**
   * Puts every zone to sleep and stops the sweep.
   *
   * This is what a Cloud Run SIGTERM runs, and it is why a deploy is an ordinary event
   * rather than an outage: every live world snapshots inside the termination grace
   * period and every client is told to re-dial. The zone that comes back on the next
   * instance is the same zone, a few hundred milliseconds older.
   */
  async shutdown(reason = 'host_restarting'): Promise<void> {
    if (this.sweep) clearInterval(this.sweep);
    this.sweep = null;
    await Promise.all([...this.zones.values()].map((zone) => zone.close(reason)));
    for (const seats of this.members.values()) {
      for (const seated of seats) seated.connection.close(reason);
    }
    this.zones.clear();
    this.members.clear();
    this.options.cage.dispose();
  }
}

/**
 * Why a join was refused — and, when something threw, what actually threw.
 *
 * The `reason` is what goes on the wire and it is deliberately incurious: telling a
 * caller which part of a ticket was wrong helps only somebody holding a stolen one. That
 * makes the `cause` the operator's entire supply of truth, so it must survive being
 * wrapped. It did not, at first: the first `zone_unavailable` this alerting ever caught
 * arrived with a stack that began inside `admit` and said nothing about what `join` had
 * hit, which is precisely the blindness the log line was added to end.
 */
export class ZoneAdmissionError extends Error {
  /** The game whose zone was refused, once the ticket has been verified enough to name it. */
  readonly slug?: string;
  /** The zone the ticket named. */
  readonly zoneId?: string;

  constructor(
    public readonly reason: string,
    options?: { cause?: unknown; slug?: string; zoneId?: string },
  ) {
    super(reason, options);
    this.name = 'ZoneAdmissionError';
    this.slug = options?.slug;
    this.zoneId = options?.zoneId;
  }
}
