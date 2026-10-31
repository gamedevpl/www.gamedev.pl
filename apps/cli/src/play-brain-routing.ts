import type { ApiClient } from './api.js';
import { BRAIN_AGENTS, type PlayBrain } from './play-brain.js';
import { getStatus } from './turn.js';
import { readyToEdit, type PickChoice, type Workshop } from './workshop.js';
import { playRound } from './play-round.js';

export type RunningPlayBrain = { workshop: Workshop; name?: string; published: boolean; started?: PlayBrain };

export function publishedBrainOptions(
  api: ApiClient,
  ws: Workshop,
  write: (line: string) => void,
  opened: (token: string) => void,
) {
  return {
    ready: () => readyToEdit({ api, ws: { ...ws, builder: 'self' }, write }),
    openRound: playRound(api, ws, opened),
  };
}

export async function selectPublishedPlayAgent(ws: Workshop, prompt: PickChoice, write: (line: string) => void) {
  if (ws.selectedAgent) return true;
  const agents = ws.adapters
    .map((adapter) => adapter.name)
    .filter((name) => (BRAIN_AGENTS as readonly string[]).includes(name));
  if (agents.length <= 1) return true;
  const selected = await prompt([...agents, 'Cancel'], 'Which local agent should handle Play?');
  if (!agents.includes(selected)) {
    write('No agent selected; the request was not started.');
    return false;
  }
  ws.selectedAgent = selected;
  return true;
}

export async function retryPlayBrain(
  api: ApiClient,
  ws: Workshop,
  brain: RunningPlayBrain | undefined,
  browser: boolean,
) {
  const task = ws.failedTask;
  if (!task || !brain?.started || brain.workshop !== ws || brain.name !== task.agent)
    throw Error('The original Play agent is no longer available. Send the request again to choose an agent.');
  if (ws.selectedAgent && ws.selectedAgent !== brain.name)
    throw Error('The selected agent changed. Send the request again to use it.');
  const status = await getStatus(api, ws.token);
  const published = browser && status.status === 'published' && brain.published;
  if (!published && (ws.builder !== 'self' || (status.builder && status.builder !== 'self')))
    throw Error('The platform owns this round. Use /builder before retrying local work.');
  await brain.started.turn(task.request, { retry: true });
}
