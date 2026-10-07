import type { Store } from '../platform/store.js';

// What the game became since its spec: asks and deliveries, oldest first.

export const MAX_DREAM_HISTORY = 10;
const MAX_LINE = 240;
export const HISTORY_WINDOW = 60;

function oneLine(text: string): string {
  // The playtest context block is machine data, not the creator's words.
  const words = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return words.length > MAX_LINE ? `${words.slice(0, MAX_LINE - 1)}…` : words;
}

export async function dreamHistory(
  store: Pick<Store, 'listBuildEvents' | 'listCreatorMessages'>,
  jobId: number,
): Promise<string[]> {
  // Wide windows: studio replies and progress steps crowd the rows we keep.
  const [events, messages] = await Promise.all([
    store.listBuildEvents(jobId, { limit: HISTORY_WINDOW }),
    store.listCreatorMessages(jobId, { limit: HISTORY_WINDOW, excludeProposals: true }),
  ]);
  const lines = [
    ...events
      .filter((event) => event.kind === 'done')
      .map((event) => ({ at: event.createdAt, text: event.text, who: 'Delivered' })),
    ...messages
      .filter((message) => !message.origin)
      .map((message) => ({ at: message.createdAt, text: message.text, who: 'Creator asked' })),
  ]
    .map((line) => ({ ...line, text: oneLine(line.text) }))
    .filter((line) => line.text)
    .sort((a, b) => a.at.localeCompare(b.at));
  return lines.slice(-MAX_DREAM_HISTORY).map((line) => `${line.who}: ${line.text}`);
}
