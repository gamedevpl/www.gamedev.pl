import { isCliAction, type CliAction, type CliSessionContext } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';

export type CliChatResult =
  | { kind: 'action'; action: CliAction; conversationId: string }
  | { kind: 'reply'; text: string; conversationId: string }
  | { kind: 'proposal'; title: string; concept: string; ack?: string; conversationId: string }
  | { kind: 'create'; token: string; slug: string; ack?: string; conversationId: string };

export async function postCliChat(
  api: ApiClient,
  text: string,
  conversationId?: string,
  prepareOnly = false,
  session?: CliSessionContext,
): Promise<CliChatResult> {
  const result = await api.request<CliChatResult>('POST', '/api/cli/chat', {
    text,
    ...(session
      ? {
          session: {
            ...session,
            agents: session.agents
              .filter((name) => typeof name === 'string' && name.length > 0 && name.length <= 40)
              .slice(0, 20),
          },
        }
      : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(prepareOnly ? { prepareOnly: true } : {}),
  });
  if (
    !result ||
    !['reply', 'proposal', 'create', 'action'].includes(result.kind) ||
    (result.kind === 'action' && !isCliAction(result.action))
  )
    throw new Error('Invalid CLI assistant response');
  return result;
}
