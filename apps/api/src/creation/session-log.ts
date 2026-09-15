import { modelOf, priceTokens } from './token-prices.js';
import type { JobCostEntry, SubmissionRecord } from '../platform/store.js';

export interface JobSessionSummary {
  jobId: number;
  title: string;
  slug?: string;
  ref: string;
  // The backend that ran it: 'copilot', 'anthropic', 'gemini', 'openai'.
  backend: string;
  model?: string;
  startedAt: string;
  finishedAt?: string;
  // Absent while running, or for an older session with no `finishedAt`.
  durationMs?: number;
  // The settled state finishedAt was stamped from, when present.
  state?: string;
  credits?: number;
  tokens?: { input: number; output: number };
  usd?: number;
  usdBounded?: boolean;
}

// One row per agent_session entry, newest first, capped to a page.
export function buildSessionLog(records: readonly SubmissionRecord[], limit: number): JobSessionSummary[] {
  const sessions: JobSessionSummary[] = [];

  for (const record of records) {
    for (const entry of record.costs ?? []) {
      if (entry.kind !== 'agent_session') continue;
      sessions.push(toSummary(record, entry));
    }
  }

  return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
}

function toSummary(record: SubmissionRecord, entry: JobCostEntry): JobSessionSummary {
  const model = entry.tokens ? modelOf(entry.tokens, entry.by) : undefined;
  // Never double-priced: see priceTokenEntries in job-costs.ts.
  const priced = entry.tokens && entry.credits === undefined ? priceTokens(entry.tokens, entry.by) : undefined;
  const usd = (entry.usd ?? 0) + (priced?.usd ?? 0);
  const started = Date.parse(entry.at);
  const finished = entry.finishedAt ? Date.parse(entry.finishedAt) : NaN;

  return {
    jobId: record.jobId,
    title: record.title,
    ...(record.slug ? { slug: record.slug } : {}),
    ref: entry.ref ?? entry.at,
    backend: entry.by,
    ...(model ? { model } : {}),
    startedAt: entry.at,
    ...(entry.finishedAt ? { finishedAt: entry.finishedAt } : {}),
    ...(Number.isFinite(started) && Number.isFinite(finished) ? { durationMs: Math.max(0, finished - started) } : {}),
    ...(entry.state ? { state: entry.state } : {}),
    ...(entry.credits !== undefined ? { credits: entry.credits } : {}),
    ...(entry.tokens ? { tokens: { input: entry.tokens.input, output: entry.tokens.output } } : {}),
    ...(usd > 0 ? { usd, ...(priced && !priced.pricedExactly ? { usdBounded: true } : {}) } : {}),
  };
}
