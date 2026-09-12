import type { GamesStore, VersionManifest } from './games-store.js';

export type ShareRefusal = 'nothing_delivered' | 'gate_pending' | 'gate_red' | 'moderation_blocked';

// Preview deliveries record their verdict apart from the publish lane's.
export function manifestVerdict(manifest: VersionManifest): { green: boolean } | undefined {
  return (manifest.deliveryMode ?? 'publish') === 'preview' ? manifest.previewGate : manifest.gate;
}

// The version a shared link actually serves, mirroring replyWithStoredDraft.
export function sharedDraftVersion(record: { previewVersion?: string; deliveredVersion?: string }): string | undefined {
  return record.previewVersion ?? record.deliveredVersion;
}

export const SHARE_REFUSAL_MESSAGES: Record<ShareRefusal, string> = {
  nothing_delivered: 'deliver a build before sharing the link — there is nothing for a visitor to play yet',
  gate_pending: 'the gate has not returned a verdict for this build yet — sharing opens once it is green',
  gate_red: 'this build is red, and a shared link is public — fix it, deliver again, then share',
  moderation_blocked: 'an operator pulled this game for a moderation reason — contact us before sharing it again',
};

export async function refuseUngatedShare(input: {
  gamesStore?: GamesStore;
  slug?: string;
  version?: string;
  moderationBlockedAt?: string;
}): Promise<ShareRefusal | null> {
  // Not the creator's to undo, so it outranks every other answer.
  if (input.moderationBlockedAt) return 'moderation_blocked';
  if (!input.slug || !input.version) return 'nothing_delivered';
  // No store, no readable verdict, so none to trust.
  if (!input.gamesStore) return 'gate_pending';
  const manifest = await input.gamesStore.getManifest(input.slug, input.version);
  const verdict = manifest ? manifestVerdict(manifest) : undefined;
  if (!verdict) return 'gate_pending';
  return verdict.green ? null : 'gate_red';
}

export interface SharedDraftGate {
  isGreen(slug: string, version: string): Promise<boolean>;
  forget(slug: string): void;
}

export const SHARED_DRAFT_VERDICT_TTL_MS = 5 * 60_000;

// One manifest read per version per window, never one per play.
export function createSharedDraftGate(input: {
  gamesStore?: GamesStore;
  now: () => number;
  ttlMs?: number;
}): SharedDraftGate {
  const ttlMs = input.ttlMs ?? SHARED_DRAFT_VERDICT_TTL_MS;
  const cache = new Map<string, { green: boolean; expiresAt: number }>();
  return {
    async isGreen(slug, version) {
      const key = `${slug}@${version}`;
      const at = input.now();
      const hit = cache.get(key);
      if (hit && hit.expiresAt > at) return hit.green;
      const green = (await refuseUngatedShare({ gamesStore: input.gamesStore, slug, version })) === null;
      // Pending is cached too; the window bounds staleness.
      cache.set(key, { green, expiresAt: at + ttlMs });
      return green;
    },
    forget(slug) {
      for (const key of [...cache.keys()]) if (key.startsWith(`${slug}@`)) cache.delete(key);
    },
  };
}
