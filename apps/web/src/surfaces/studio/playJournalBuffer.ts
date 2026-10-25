import {
  PLAY_JOURNAL_MAX_BYTES,
  PLAY_JOURNAL_MAX_ENTRIES,
  PLAY_JOURNAL_WINDOW_MS,
  PLAY_JOURNAL_KINDS,
  type PlayJournalAttachment,
  type PlayJournalEntry,
} from '@gamedevpl/contract';
export class PlayJournalBuffer {
  private recording: PlayJournalAttachment | null = null;
  private sizes: number[] = [];
  private bytes = 0;
  private through = -1;
  private listeners = new Set<() => void>();
  private revision = 0;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  getRevision = () => this.revision;
  private notify() {
    this.revision++;
    for (const f of this.listeners) f();
  }
  reset() {
    this.recording = null;
    this.sizes = [];
    this.bytes = 0;
    this.through = -1;
    this.notify();
  }
  append(message: { recordingId: string; startedAt: number; json: string }, version: string): number | null {
    if (
      !/^[a-f0-9-]{36}$/i.test(message.recordingId) ||
      !Number.isFinite(message.startedAt) ||
      message.startedAt < 0 ||
      typeof message.json !== 'string' ||
      message.json.length > 256000
    )
      return null;
    let entries: PlayJournalEntry[];
    try {
      entries = JSON.parse(message.json);
    } catch {
      return null;
    }
    if (!Array.isArray(entries) || entries.length > 256 || !entries.length) return null;
    if (
      entries.some(
        (e) =>
          !e ||
          !Number.isSafeInteger(e.seq) ||
          e.seq < 0 ||
          !Number.isSafeInteger(e.frame) ||
          e.frame < 0 ||
          !Number.isFinite(e.timeMs) ||
          e.timeMs < 0 ||
          !PLAY_JOURNAL_KINDS.includes(e.kind),
      )
    )
      return null;
    if (this.recording?.recordingId !== message.recordingId) {
      this.reset();
      this.recording = {
        recordingId: message.recordingId,
        startedAt: message.startedAt,
        version,
        droppedEntries: 0,
        entries: [],
      };
    }
    const r = this.recording!;
    for (const e of entries) {
      if (e.seq <= this.through) continue;
      if (r.entries.length && e.timeMs < r.entries.at(-1)!.timeMs) return null;
      const size = new TextEncoder().encode(JSON.stringify(e)).length;
      this.through = e.seq;
      if (size > 128_000) {
        r.droppedEntries++;
        continue;
      }
      r.entries.push(e);
      this.sizes.push(size + 1);
      this.bytes += size + 1;
      while (
        r.entries.length > PLAY_JOURNAL_MAX_ENTRIES ||
        this.bytes > PLAY_JOURNAL_MAX_BYTES - 2000 ||
        e.timeMs - r.entries[0]!.timeMs > PLAY_JOURNAL_WINDOW_MS
      ) {
        r.entries.shift();
        this.bytes -= this.sizes.shift()!;
        r.droppedEntries++;
      }
    }
    this.notify();
    return this.through;
  }
  summary() {
    const r = this.recording;
    return r?.entries.length ? { seconds: Math.round((r.entries.at(-1)!.timeMs - r.entries[0]!.timeMs) / 1000) } : null;
  }
  snapshot(): PlayJournalAttachment | null {
    return this.recording?.entries.length ? structuredClone(this.recording) : null;
  }
}
