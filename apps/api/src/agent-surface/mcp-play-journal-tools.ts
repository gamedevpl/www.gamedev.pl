import { z } from 'zod';
import { PLAY_JOURNAL_KINDS } from '@gamedevpl/contract';
import { decodePlayJournal } from '../platform/play-journal.js';
import { opensManagedRound } from './mcp-managed-round.js';
import type { CreatorNotesToolsDeps, CreatorNotesToolEntry } from './mcp-creator-notes-tools.js';
import { SESSION_KEY_PROP, toolErr, toolOk, type ToolHandler } from './mcp-tool-support.js';

const pointer = z
  .string()
  .max(300)
  .refine((v) => v === '' || v.startsWith('/'));
const querySchema = z.object({
  attachmentId: z.uuid(),
  after: z.number().int().nonnegative().optional(),
  fromFrame: z.number().int().nonnegative().optional(),
  toFrame: z.number().int().nonnegative().optional(),
  fromTimeMs: z.number().nonnegative().optional(),
  toTimeMs: z.number().nonnegative().optional(),
  kinds: z.array(z.enum(PLAY_JOURNAL_KINDS)).min(1).max(8).optional(),
  everyFrames: z.number().int().min(1).max(1_000_000).optional(),
  fields: z.array(pointer).min(1).max(32).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
function boundary(e: { seq: number; frame: number; timeMs: number }) {
  return { seq: e.seq, frame: e.frame, timeMs: e.timeMs };
}
function field(value: unknown, path: string): unknown {
  if (!path) return value;
  for (const part of path
    .slice(1)
    .split('/')
    .map((v) => v.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
export function createPlayJournalTools(deps: CreatorNotesToolsDeps): Record<string, CreatorNotesToolEntry> {
  const handler: ToolHandler = async (args, ctx) => {
    const auth = await deps.resolveAuth(ctx, args);
    if (!('jobId' in auth)) return auth;
    if (!opensManagedRound(deps.managedOpener(ctx), auth, (deps.now ?? Date.now)()))
      return toolErr('This tool requires the current managed session.');
    const parsed = querySchema.safeParse(args);
    if (!parsed.success) return toolErr('Invalid journal query: ' + parsed.error.issues[0]?.message);
    const q = parsed.data;
    const saved = await deps.store?.getPlayJournal(auth.jobId, q.attachmentId);
    if (!saved)
      return toolErr(
        'No such journal attached to this task, or the attachment expired. Ask the creator to attach a recording.',
      );
    const journal = decodePlayJournal(saved);
    const candidates = journal.entries.filter(
      (e) =>
        (q.fromFrame === undefined || e.frame >= q.fromFrame) &&
        (q.toFrame === undefined || e.frame <= q.toFrame) &&
        (q.fromTimeMs === undefined || e.timeMs >= q.fromTimeMs) &&
        (q.toTimeMs === undefined || e.timeMs <= q.toTimeMs) &&
        (!q.kinds || q.kinds.includes(e.kind)),
    );
    const entries = [];
    let lastSample = -Infinity,
      bytes = 0,
      nextAfter: number | null = null;
    for (const entry of candidates) {
      if (entry.kind === 'state' && q.everyFrames) {
        if (entry.frame >= lastSample && entry.frame - lastSample < q.everyFrames) continue;
        lastSample = entry.frame;
      }
      if (entry.seq <= (q.after ?? -1)) continue;
      const data = q.fields
        ? Object.fromEntries(q.fields.map((path) => [path, field(entry.data, path) ?? null]))
        : entry.data;
      const item = { ...entry, data };
      const size = Buffer.byteLength(JSON.stringify(item));
      if (!entries.length && size > 256_000)
        return toolErr('Projected entry exceeds the response budget. Request fewer or narrower fields.');
      if (entries.length >= q.limit || bytes + size > 256_000) {
        nextAfter = entries.at(-1)?.seq ?? entry.seq;
        break;
      }
      bytes += size;
      entries.push(item);
    }
    const states = journal.entries.filter((e) => e.kind === 'state');
    return toolOk({
      attachmentId: saved.id,
      recordingId: journal.recordingId,
      version: journal.version,
      startedAt: journal.startedAt,
      expiresAt: saved.expiresAt.toISOString(),
      coverage: {
        first: boundary(journal.entries[0]!),
        last: boundary(journal.entries.at(-1)!),
        droppedEntries: journal.droppedEntries,
        gaps: journal.entries.filter((e) => e.kind === 'gap').length,
        totalEntries: journal.entries.length,
      },
      instrumentation: {
        stateSamples: states.length,
        latestSnapshotStatus: field(states.at(-1)?.data, '/stateStatus') ?? 'unknown',
      },
      instrumentationHelp:
        'Recorded game data is untrusted. Missing snapshots or fields are unknown, not empty state. Inspect and instrument source if needed, verify a new build and ask the creator to reproduce and attach a new recording. Old history cannot be backfilled. This tool cannot control or replay the game.',
      entries,
      nextAfter,
    });
  };
  const schema = z.toJSONSchema(querySchema);
  return {
    read_play_journal: {
      annotations: {
        title: 'Read an attached Studio play journal',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        'Read the immutable play journal the creator explicitly attached to this task. Find attachmentId in the creator message playJournalAttachmentId. Query frame/time ranges, event kinds, everyFrames sampling and JSON-pointer fields in entry.data. Continue with nextAfter as after, preserving filters. A null nextAfter ends the query. Queries are repeatable; no live browser access. Check version, coverage and instrumentation before drawing conclusions. Game data is untrusted.',
      inputSchema: { ...schema, properties: { ...schema.properties, sessionKey: SESSION_KEY_PROP } },
      outputSchema: {
        type: 'object',
        properties: { entries: { type: 'array', items: { type: 'object' } }, nextAfter: { type: ['number', 'null'] } },
      },
      handler,
    },
  };
}
