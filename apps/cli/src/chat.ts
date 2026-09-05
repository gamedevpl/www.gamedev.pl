import type { ApiClient } from './api.js';

export type CliChatResult =
  | { kind: 'reply'; text: string; conversationId: string }
  | { kind: 'create'; token: string; slug: string; ack?: string; conversationId: string };

export async function postCliChat(api: ApiClient, text: string, conversationId?: string): Promise<CliChatResult> {
  return api.request<CliChatResult>('POST', '/api/cli/chat', {
    text,
    ...(conversationId ? { conversationId } : {}),
  });
}
