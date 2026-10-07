import { stripPlaytestContext } from '../platform/playtest-context.js';
import type { Store } from '../platform/store.js';

// What the game became since its spec: asks and deliveries, oldest first.

export const MAX_DREAM_HISTORY = 10;
const MAX_LINE = 240;
export const HISTORY_WINDOW = 60;
// A published game opens a new job per improvement round.
export const HISTORY_JOBS = 3;

type HistoryStore = Pick<Store, 'listBuildEvents' | 'listCreatorMessages' | 'listSubmissionsBySlug'>;

function oneLine(text: string): string {
  // The playtest context block is machine data, not the creator's words.
  const words = stripPlaytestContext(text).replace(/\s+/g, ' ').trim();
  return words.length > MAX_LINE ? `${words.slice(0, MAX_LINE - 1)}…` : words;
}

async function jobLines(store: HistoryStore, jobId: number) {
  // Wide windows: studio replies and progress steps crowd the rows we keep.
  const [events, messages] = await Promise.all([
    store.listBuildEvents(jobId, { limit: HISTORY_WINDOW }),
    store.listCreatorMessages(jobId, { limit: HISTORY_WINDOW, excludeProposals: true }),
  ]);
  return [
    ...events
      .filter((event) => event.kind === 'done')
      .map((event) => ({ at: event.createdAt, text: event.text, who: 'Delivered' })),
    ...messages
      .filter((message) => !message.origin)
      .map((message) => ({ at: message.createdAt, text: message.text, who: 'Creator asked' })),
  ];
}

export async function dreamHistory(store: HistoryStore, jobId: number, slug?: string): Promise<string[]> {
  const siblings = slug ? (await store.listSubmissionsBySlug(slug)).map((record) => record.jobId) : [];
  const jobs = [jobId, ...siblings.filter((id) => id !== jobId)].slice(0, HISTORY_JOBS);
  const lines = (await Promise.all(jobs.map((id) => jobLines(store, id))))
    .flat()
    .map((line) => ({ ...line, text: oneLine(line.text) }))
    .filter((line) => line.text)
    .sort((a, b) => a.at.localeCompare(b.at));
  return lines.slice(-MAX_DREAM_HISTORY).map((line) => `${line.who}: ${line.text}`);
}
