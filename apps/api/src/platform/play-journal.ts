import { gzipSync, gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PLAY_JOURNAL_KINDS, PLAY_JOURNAL_MAX_BYTES, PLAY_JOURNAL_MAX_ENTRIES } from '@gamedevpl/contract';
import type { Store } from './store.js';

export const PlayJournalSchema = z
  .object({
    recordingId: z.uuid(),
    startedAt: z.number().finite().nonnegative(),
    version: z.string().min(1).max(200),
    droppedEntries: z.number().int().nonnegative(),
    entries: z
      .array(
        z
          .object({
            seq: z.number().int().nonnegative(),
            timeMs: z.number().finite().nonnegative(),
            frame: z.number().int().nonnegative(),
            kind: z.enum(PLAY_JOURNAL_KINDS),
            data: z.unknown(),
          })
          .strict(),
      )
      .min(1)
      .max(PLAY_JOURNAL_MAX_ENTRIES),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Buffer.byteLength(JSON.stringify(value)) > PLAY_JOURNAL_MAX_BYTES)
      ctx.addIssue({ code: 'custom', message: 'play journal is too large' });
    if (value.entries.some((e) => Buffer.byteLength(JSON.stringify(e)) > 128_000))
      ctx.addIssue({ code: 'custom', message: 'play journal entry is too large' });
    for (let i = 1; i < value.entries.length; i++) {
      if (
        value.entries[i]!.seq <= value.entries[i - 1]!.seq ||
        value.entries[i]!.timeMs < value.entries[i - 1]!.timeMs
      ) {
        ctx.addIssue({ code: 'custom', message: 'play journal entries must be ordered' });
        break;
      }
    }
  });
export type StoredPlayJournal = {
  id: string;
  jobId: number;
  uid: string;
  createdAt: string;
  expiresAt: Date;
  gzip: string;
};
export async function savePlayJournal(
  store: Store,
  jobId: number,
  uid: string,
  value: z.infer<typeof PlayJournalSchema>,
) {
  const gzip = gzipSync(JSON.stringify(value)).toString('base64');
  if (Buffer.byteLength(gzip) > 800_000)
    throw Object.assign(Error('play journal is too large; attach a shorter recording'), { statusCode: 413 });
  const record: StoredPlayJournal = {
    id: randomUUID(),
    jobId,
    uid,
    gzip,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
  };
  await store.putPlayJournal(record);
  return record;
}
export function decodePlayJournal(record: StoredPlayJournal) {
  return PlayJournalSchema.parse(
    JSON.parse(gunzipSync(Buffer.from(record.gzip, 'base64'), { maxOutputLength: PLAY_JOURNAL_MAX_BYTES }).toString()),
  );
}
