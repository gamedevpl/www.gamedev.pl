import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import type { FastifyRequest } from 'fastify';

// The line playtest-context.ts writes under a message's context block.
const SHOT_IDS = /referenceImageShotIds:\s*([^\n`]+)/g;

export interface InboxReferenceImage {
  id: string;
  url: string;
  expiresAt: string;
}

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

// Download URLs for the pictures the pending messages name.
export async function inboxReferenceImages(
  messages: ReadonlyArray<{ text: string }>,
  fetch: { request: FastifyRequest; channelToken: string; injectChannel: InjectChannel },
): Promise<InboxReferenceImage[]> {
  const wanted = new Set(referenceShotIds(messages));
  if (wanted.size === 0) return [];
  const res = await fetch.injectChannel(
    fetch.request,
    'GET',
    `${AGENT_CHANNEL_ROUTES.REFERENCE_IMAGES}?urls=1`,
    fetch.channelToken,
  );
  // The text still names the ids; get_reference_images can retry.
  if (res.statusCode !== 200) return [];
  const body = res.json() as { images?: Array<{ id: string; url?: string; expiresAt?: string }> };
  return (body.images ?? []).flatMap((image) =>
    image.url && image.expiresAt && wanted.has(image.id)
      ? [{ id: image.id, url: image.url, expiresAt: image.expiresAt }]
      : [],
  );
}
