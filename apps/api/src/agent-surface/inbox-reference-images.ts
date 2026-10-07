import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import type { FastifyRequest } from 'fastify';
import type { ToolResult } from './mcp-tool-support.js';

// The line playtest-context.ts writes under a message's context block.
const SHOT_IDS = /referenceImageShotIds:\s*([^\n`]+)/g;

export function referenceShotIds(messages: ReadonlyArray<{ text: string }>): string[] {
  const ids = new Set<string>();
  for (const { text } of messages) {
    for (const match of text.matchAll(SHOT_IDS)) {
      for (const id of match[1]!.split(',')) if (id.trim()) ids.add(id.trim());
    }
  }
  return [...ids];
}

type InjectChannel = (
  request: FastifyRequest,
  method: 'GET',
  path: string,
  channelToken: string,
) => Promise<{ statusCode: number; json: () => unknown }>;

// A message names its pictures by id; the model only sees attached ones.
export async function attachInboxReferenceImages(
  result: ToolResult,
  messages: ReadonlyArray<{ text: string }>,
  fetch: { request: FastifyRequest; channelToken: string; injectChannel: InjectChannel },
): Promise<ToolResult> {
  const wanted = new Set(referenceShotIds(messages));
  if (wanted.size === 0) return result;
  const res = await fetch.injectChannel(
    fetch.request,
    'GET',
    AGENT_CHANNEL_ROUTES.REFERENCE_IMAGES,
    fetch.channelToken,
  );
  // The text still names the ids; get_reference_images can retry.
  if (res.statusCode !== 200) return result;
  const body = res.json() as { images?: Array<{ id: string; png?: string }> };
  for (const image of body.images ?? []) {
    if (image.png && wanted.has(image.id))
      result.content.push({ type: 'image', data: image.png, mimeType: 'image/png' });
  }
  return result;
}
