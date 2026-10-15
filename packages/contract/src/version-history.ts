import type { DeliveryMode } from './delivery-mode.js';

export type HistoryVersion = {
  version: string;
  createdAt: string;
  jobId: number;
  sourceFiles: string[];
  deliveryMode?: DeliveryMode;
  summary?: string;
  backend?: string;
  model?: string;
  origin?: 'editor' | 'remix' | 'seal';
  verdict: 'pending' | 'passed' | 'failed' | 'kit_outdated' | 'crashed' | 'timed_out';
};

export type VersionHistoryPage = {
  slug: string;
  versions: HistoryVersion[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type HistorySourceFile = { path: string; content: string; encoding?: 'utf8' | 'base64' };
export type VersionHistoryTree = {
  slug: string;
  version: string;
  metadata: HistoryVersion;
  files: HistorySourceFile[];
};
