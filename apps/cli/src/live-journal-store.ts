import { closeSync, mkdtempSync, openSync, readSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { journalBatch, type JournalEntry, type JournalQuery } from './live-journal-protocol.js';
import {
  journalInstrumentation,
  observeInstrumentation,
  instrumentationReport,
  INSTRUMENTATION_HELP,
  type JournalInstrumentation,
} from './live-journal-instrumentation.js';

type Chunk = {
  offset: number;
  size: number;
  rawBytes: number;
  first: number;
  last: number;
  firstTime: number;
  lastTime: number;
  minFrame: number;
  maxFrame: number;
};
type Source = { tabId: string; sourceId: number; revision: string };
type Recording = Source & {
  recordingId: string;
  startedAt: number;
  last: number;
  entries: number;
  firstTimeMs: number;
  lastTimeMs: number;
  firstFrame: number;
  lastFrame: number;
  counts: Partial<Record<JournalEntry['kind'], number>>;
  chunks: Chunk[];
  missingEntries: number;
  reportedGaps: number;
  connected: boolean;
  receivedAt: number;
  instrumentation: JournalInstrumentation;
};
function pointer(data: unknown, path: string): unknown {
  if (!path) return data;
  let current = data;
  for (const part of path.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
function matches(data: unknown, where: JournalQuery['where']): boolean {
  if (!where) return true;
  const actual = pointer(data, where.path),
    expected = where.value;
  switch (where.op) {
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== undefined && actual !== expected;
    case 'contains':
      return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
  }
}

export function createJournalStore(maxBytes = 512 * 1024 * 1024, codeFor?: (source: Source) => unknown) {
  const recordings = new Map<string, Recording>();
  let directory: string | undefined,
    fd: number | undefined,
    bytes = 0,
    chunkCount = 0,
    stopped: string | undefined;
  const rejected: Array<{ tabId: string; reason: string }> = [];
  const status = () => ({
    bytes,
    maxBytes,
    stopped: stopped ?? null,
    retention: 'until Play closes',
    replayable: false,
    rejected,
    instrumentationHelp: INSTRUMENTATION_HELP,
    recordings: [...recordings.values()].map(({ chunks, instrumentation, ...record }) => ({
      ...record,
      ...(codeFor ? { code: codeFor(record) } : {}),
      instrumentation: instrumentationReport(instrumentation),
      chunks: chunks.length,
      tail: 'Only acknowledged batches are available; an abrupt close may lose buffered entries.',
    })),
  });
  const readChunk = (chunk: Chunk): JournalEntry[] => {
    const compressed = Buffer.alloc(chunk.size);
    let read = 0;
    while (read < chunk.size) {
      const count = readSync(fd!, compressed, read, chunk.size - read, chunk.offset + read);
      if (!count) throw Error('Journal file ended unexpectedly.');
      read += count;
    }
    return JSON.parse(gunzipSync(compressed, { maxOutputLength: 2 * 1024 * 1024 }).toString()) as JournalEntry[];
  };
  return {
    status,
    source(recordingId: string): Source {
      const record = recordings.get(recordingId);
      if (!record) throw Error('Unknown recordingId; list game_journal first.');
      return { tabId: record.tabId, sourceId: record.sourceId, revision: record.revision };
    },
    reject(tabId: string, reason: string) {
      rejected.push({ tabId, reason });
      if (rejected.length > 32) rejected.shift();
    },
    append(source: Source, raw: unknown) {
      const batch = journalBatch.parse(raw);
      let recording = recordings.get(batch.recordingId);
      if (
        recording &&
        (recording.tabId !== source.tabId ||
          recording.sourceId !== source.sourceId ||
          recording.revision !== source.revision)
      )
        throw Error('Journal belongs to another game instance.');
      if (stopped) return { through: recording?.last ?? 0, stopped };
      if (!recording) {
        if (recordings.size >= 256) throw Error('Journal instance limit reached.');
        for (const previous of recordings.values()) if (previous.tabId === source.tabId) previous.connected = false;
        recording = {
          tabId: source.tabId,
          sourceId: source.sourceId,
          revision: source.revision,
          recordingId: batch.recordingId,
          startedAt: batch.startedAt,
          last: 0,
          entries: 0,
          firstTimeMs: batch.entries[0]!.timeMs,
          lastTimeMs: 0,
          firstFrame: batch.entries[0]!.frame,
          lastFrame: 0,
          counts: {},
          chunks: [],
          missingEntries: 0,
          reportedGaps: 0,
          connected: true,
          receivedAt: Date.now(),
          instrumentation: journalInstrumentation(),
        };
        recordings.set(batch.recordingId, recording);
      }
      const fresh = batch.entries.filter((entry) => entry.seq > recording.last);
      if (!fresh.length) return { through: recording.last };
      let last = recording.last,
        time = recording.lastTimeMs,
        missing = 0;
      for (const entry of fresh) {
        if (entry.seq <= last || entry.timeMs < time) throw Error('Journal entries must be ordered.');
        missing += entry.seq - last - 1;
        last = entry.seq;
        time = entry.timeMs;
      }
      const json = JSON.stringify(fresh);
      if (Buffer.byteLength(json) > 2 * 1024 * 1024) throw Error('Journal batch too large.');
      const compressed = gzipSync(json, { level: 1 });
      if (bytes + compressed.length > maxBytes || chunkCount >= 100_000) {
        stopped = 'Journal capacity reached; retained history is intact, later entries are unavailable.';
        return { through: recording.last, stopped };
      }
      try {
        if (fd === undefined) {
          directory = mkdtempSync(join(tmpdir(), 'gamedevpl-journal-'));
          fd = openSync(join(directory, 'journal.gz'), 'wx+', 0o600);
        }
        let written = 0;
        while (written < compressed.length) {
          const count = writeSync(fd, compressed, written, compressed.length - written, bytes + written);
          if (!count) throw Error('Journal write made no progress.');
          written += count;
        }
      } catch {
        stopped = 'Journal storage failed; later entries are unavailable.';
        return { through: recording.last, stopped };
      }
      recording.chunks.push({
        offset: bytes,
        size: compressed.length,
        rawBytes: Buffer.byteLength(json),
        first: fresh[0]!.seq,
        last,
        firstTime: fresh[0]!.timeMs,
        lastTime: time,
        minFrame: Math.min(...fresh.map((entry) => entry.frame)),
        maxFrame: Math.max(...fresh.map((entry) => entry.frame)),
      });
      chunkCount++;
      bytes += compressed.length;
      recording.last = last;
      recording.lastFrame = fresh.at(-1)!.frame;
      for (const entry of fresh) recording.counts[entry.kind] = (recording.counts[entry.kind] ?? 0) + 1;
      recording.lastTimeMs = time;
      recording.entries += fresh.length;
      recording.missingEntries += missing;
      recording.reportedGaps += fresh.filter((entry) => entry.kind === 'gap').length;
      recording.connected = true;
      recording.receivedAt = Date.now();
      for (const entry of fresh) observeInstrumentation(recording.instrumentation, entry);
      return { through: last };
    },
    disconnect(tabId: string) {
      for (const record of recordings.values()) if (record.tabId === tabId) record.connected = false;
    },
    read(query: JournalQuery) {
      const record = recordings.get(query.recordingId);
      if (!record) throw Error('Unknown recordingId; list game_journal first.');
      const through = Math.min(query.through ?? record.last, record.last);
      let cursor = query.after ?? 0,
        scanned = 0,
        size = 0,
        decoded = 0,
        more = false;
      const entries: JournalEntry[] = [];
      const fields = [...new Set([...(query.fields ?? []), ...(query.where ? [query.where.path] : [])])];
      const fieldAvailability = Object.fromEntries(fields.map((path) => [path, { present: 0, missing: 0 }]));
      outer: for (const chunk of record.chunks) {
        if (chunk.last <= cursor || chunk.first > through) continue;
        if (
          (query.fromFrame !== undefined && chunk.maxFrame < query.fromFrame) ||
          (query.toFrame !== undefined && chunk.minFrame > query.toFrame) ||
          (query.fromTimeMs !== undefined && chunk.lastTime < query.fromTimeMs) ||
          (query.toTimeMs !== undefined && chunk.firstTime > query.toTimeMs)
        ) {
          cursor = Math.min(chunk.last, through);
          continue;
        }
        if (decoded + chunk.rawBytes > 16 * 1024 * 1024) {
          more = true;
          break;
        }
        decoded += chunk.rawBytes;
        for (const entry of readChunk(chunk)) {
          if (entry.seq <= cursor || entry.seq > through) continue;
          if (scanned >= 20_000) {
            more = true;
            break outer;
          }
          const inRange =
            (query.fromFrame === undefined || entry.frame >= query.fromFrame) &&
            (query.toFrame === undefined || entry.frame <= query.toFrame) &&
            (query.fromTimeMs === undefined || entry.timeMs >= query.fromTimeMs) &&
            (query.toTimeMs === undefined || entry.timeMs <= query.toTimeMs) &&
            (!query.kinds || query.kinds.includes(entry.kind)) &&
            (entry.kind !== 'state' || (entry.frame - (query.fromFrame ?? 0)) % (query.everyFrames ?? 1) === 0);
          if (inRange)
            for (const path of fields) {
              fieldAvailability[path]![pointer(entry.data, path) === undefined ? 'missing' : 'present']++;
            }
          const include = inRange && matches(entry.data, query.where);
          if (include) {
            const data = query.fields
              ? Object.fromEntries(query.fields.map((path) => [path, pointer(entry.data, path) ?? null]))
              : entry.data;
            const selected = {
              ...entry,
              data,
              ...(query.fields
                ? { missingFields: query.fields.filter((path) => pointer(entry.data, path) === undefined) }
                : {}),
            };
            const length = Buffer.byteLength(JSON.stringify(selected));
            if (size + length > 512 * 1024) {
              if (!entries.length) throw Error('Entry exceeds response limit; select fewer fields.');
              more = true;
              break outer;
            }
            entries.push(selected);
            size += length;
          }
          cursor = entry.seq;
          scanned++;
          if (entries.length >= (query.limit ?? 100)) {
            more = cursor < through;
            break outer;
          }
        }
      }
      return {
        recordingId: record.recordingId,
        revision: record.revision,
        ...(codeFor ? { code: codeFor(record) } : {}),
        through,
        nextAfter: more ? cursor : null,
        scanned,
        entries,
        instrumentation: instrumentationReport(record.instrumentation),
        instrumentationHelp: INSTRUMENTATION_HELP,
        fieldAvailability: {
          scope:
            'examined entries in this page matching range/kinds/sampling, before where filtering; zero counts mean no evidence',
          paths: fieldAvailability,
        },
        coverage: {
          missingEntries: record.missingEntries,
          reportedGaps: record.reportedGaps,
          connected: record.connected,
          stopped: stopped ?? null,
        },
      };
    },
    close() {
      if (fd !== undefined) closeSync(fd);
      if (directory) rmSync(directory, { recursive: true, force: true });
      fd = undefined;
      directory = undefined;
      recordings.clear();
    },
  };
}
