// Validates creator-supplied PNGs and stores them as build shots.

import { MAX_SHOT_BYTES } from '@gamedevpl/contract';
import type { ChatAgentImage } from '../creation/chat-agent.js';
import type { BuildMediaStore } from './store.js';

export const MAX_REFERENCE_IMAGES = 4;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_CREATOR_SHOT_BYTES = MAX_SHOT_BYTES;

// Validates and persists a base64 PNG as a build shot.
async function storeCreatorImage(
  store: BuildMediaStore,
  jobId: number,
  pngBase64: string | undefined,
  label: 'creator-playtest' | 'creator-reference',
): Promise<string | undefined> {
  if (!pngBase64) return undefined;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(pngBase64, 'base64');
  } catch {
    return undefined;
  }
  if (bytes.length === 0 || bytes.length > MAX_CREATOR_SHOT_BYTES) return undefined;
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return undefined;
  const stored = await store.appendBuildShot(jobId, {
    data: bytes.toString('base64'),
    label,
  });
  return stored.id;
}

export async function storeCreatorPlaytestShot(
  store: BuildMediaStore,
  jobId: number,
  pngBase64: string | undefined,
): Promise<string | undefined> {
  return storeCreatorImage(store, jobId, pngBase64, 'creator-playtest');
}

// Persists up to MAX_REFERENCE_IMAGES images; also returns validated bytes for chat.
export async function storeCreatorReferenceImages(
  store: BuildMediaStore,
  jobId: number,
  pngBase64List: string[] | undefined,
): Promise<{ ids: string[]; images: ChatAgentImage[] }> {
  if (!pngBase64List || pngBase64List.length === 0) return { ids: [], images: [] };
  const ids: string[] = [];
  const images: ChatAgentImage[] = [];
  for (const png of pngBase64List.slice(0, MAX_REFERENCE_IMAGES)) {
    const id = await storeCreatorImage(store, jobId, png, 'creator-reference');
    if (id) {
      ids.push(id);
      images.push({ data: png, mediaType: 'image/png' });
    }
  }
  return { ids, images };
}
