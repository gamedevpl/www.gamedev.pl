// Immutable Studio attachments; these are independent of live-control tools.
export const PLAY_JOURNAL_MAX_BYTES = 2_000_000;
export const PLAY_JOURNAL_MAX_ENTRIES = 10_000;
export const PLAY_JOURNAL_WINDOW_MS = 120_000;
export const PLAY_JOURNAL_KINDS = [
  'state',
  'input',
  'error',
  'console',
  'signal',
  'audio',
  'lifecycle',
  'gap',
] as const;
export type PlayJournalEntry = {
  seq: number;
  timeMs: number;
  frame: number;
  kind: (typeof PLAY_JOURNAL_KINDS)[number];
  data: unknown;
};
export type PlayJournalAttachment = {
  recordingId: string;
  startedAt: number;
  version: string;
  droppedEntries: number;
  entries: PlayJournalEntry[];
};

export type FeedbackContext = {
  playJournal?: PlayJournalAttachment;
  screenshotPng?: string;
  instrumentation?: {
    playSeconds?: number;
    lastAliveFrames?: number | null;
    errors?: string[];
    progress?: string[];
  };
  // Base64 PNGs, no data: prefix. Max 4.
  referenceImages?: string[];
};
