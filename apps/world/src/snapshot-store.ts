import { Firestore } from '@google-cloud/firestore';
import {
  MAX_STATE_BYTES,
  ZONE_SNAPSHOT_VERSION,
  type ZoneSnapshot,
  type ZoneSnapshotStore,
} from '@gamedevpl/zone-core';

/**
 * Where a sleeping zone lives (docs/p3-zone-host-infra.md §4).
 *
 * One document per zone at `zones/{zoneId}` — an idle world is a single Firestore
 * document and nothing else, which is the whole cost claim in one sentence. Firestore's
 * document limit is 1 MiB and the sim contract caps state at 192 KiB, so the ceiling is
 * checked here as well: a write that would be refused by the database is refused earlier,
 * where the error can say what actually went wrong.
 *
 * The state is stored as an opaque **string**, not as parsed fields. That is the P1 save
 * lesson applied a third time and it matters more here than it did there: Firestore
 * rejects nested arrays outright, and a sim holding a 2D grid — which is completely
 * ordinary, and is exactly what the reference game holds — would have failed at runtime,
 * in production, for one game, long after every in-memory test went green. Storing the
 * string also makes the byte cap exact, because the thing measured is the thing stored.
 */

const COLLECTION = 'zones';

export interface FirestoreZoneStoreOptions {
  firestore?: Firestore;
  collection?: string;
}

export function createFirestoreZoneStore(options: FirestoreZoneStoreOptions = {}): ZoneSnapshotStore {
  const firestore = options.firestore ?? new Firestore();
  const collection = options.collection ?? COLLECTION;

  return {
    async load(zoneId) {
      const snapshot = await firestore.collection(collection).doc(zoneId).get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() as Partial<ZoneSnapshot> | undefined;
      if (!data) return null;

      // A stored shape this host did not write never reaches a sim. The zone starts
      // fresh instead, which is the same call P1 made for a stale save: migration is
      // opt-in, and a clean start cannot crash a world.
      if (
        data.version !== ZONE_SNAPSHOT_VERSION ||
        typeof data.state !== 'string' ||
        typeof data.seed !== 'number' ||
        typeof data.tick !== 'number' ||
        typeof data.draws !== 'number' ||
        typeof data.savedAt !== 'number'
      ) {
        return null;
      }

      return {
        version: data.version,
        seed: data.seed,
        tick: data.tick,
        draws: data.draws,
        state: data.state,
        savedAt: data.savedAt,
      };
    },

    async save(zoneId, snapshot) {
      const bytes = Buffer.byteLength(snapshot.state, 'utf8');
      if (bytes > MAX_STATE_BYTES) {
        throw new Error(
          `zone ${zoneId} snapshot is ${bytes} bytes, over the ${MAX_STATE_BYTES} byte ceiling the sim ` +
            'contract sets. A Firestore document is 1 MiB and a snapshot shares it with bookkeeping.',
        );
      }
      await firestore.collection(collection).doc(zoneId).set(snapshot);
    },
  };
}

/** Snapshots in memory, for local development without a Firestore emulator. */
export function createMemoryZoneStore(): ZoneSnapshotStore {
  const saved = new Map<string, ZoneSnapshot>();
  return {
    async load(zoneId) {
      return saved.get(zoneId) ?? null;
    },
    async save(zoneId, snapshot) {
      saved.set(zoneId, snapshot);
    },
  };
}
