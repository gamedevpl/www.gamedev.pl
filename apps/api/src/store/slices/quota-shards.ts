import { FieldValue, type Firestore } from '@google-cloud/firestore';

// Firestore takes ~1 write/s per document; some counters fire per request.

// Each shard carries cap/SHARDS; the ceilings still sum to the cap.

// Skew can refuse before the nominal cap, which is the safe direction.
export const COUNTER_SHARDS = 10;

// One document per shard, beside the day's single-document counters.
export function shardRef(db: Firestore, dateStr: string, field: string, shard: number) {
  return db.collection('globalUsageShards').doc(`${dateStr}__${field}__${shard}`);
}

export async function shardedCount(db: Firestore, dateStr: string, field: string): Promise<number> {
  const snaps = await db.getAll(
    ...Array.from({ length: COUNTER_SHARDS }, (_, shard) => shardRef(db, dateStr, field, shard)),
  );
  return snaps.reduce((total, snap) => {
    const value = snap.data()?.count;
    return total + (typeof value === 'number' ? value : 0);
  }, 0);
}

export async function spendShard(
  db: Firestore,
  dateStr: string,
  field: string,
  limit: number,
): Promise<{ allowed: boolean; current: number }> {
  const shard = Math.floor(Math.random() * COUNTER_SHARDS);
  const ref = shardRef(db, dateStr, field, shard);
  const shardLimit = Math.ceil(limit / COUNTER_SHARDS);
  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const value = snap.data()?.count;
    const current = typeof value === 'number' ? value : 0;
    if (current >= shardLimit) {
      return { allowed: false, current: current * COUNTER_SHARDS };
    }
    const nextVal = current + 1;
    transaction.set(ref, { count: nextVal }, { merge: true });
    return { allowed: true, current: nextVal * COUNTER_SHARDS };
  });
}

// Uncapped: one write, no read-before-write.
export async function bumpShard(db: Firestore, dateStr: string, field: string, delta: number): Promise<number> {
  const shard = Math.floor(Math.random() * COUNTER_SHARDS);
  await shardRef(db, dateStr, field, shard).set({ count: FieldValue.increment(delta) }, { merge: true });
  return delta;
}
