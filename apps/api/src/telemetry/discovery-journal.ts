import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rememberBounded } from '../platform/bounded-map.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';
import type { Store } from '../platform/store.js';
import type { DiscoveryRow } from '../store/slices/discovery-journal.js';

// Discovery journal writes; flag re-checked here, refusals answer 202 accepted 0.

// Same ceiling as a play-telemetry progress label.
export const MAX_DISCOVERY_LABEL_LENGTH = 40;
// New labels per flush.
const MAX_LABELS_PER_REQUEST = 50;
// Distinct labels one open may record.
export const MAX_LABELS_PER_JOURNAL = 400;
// Focused seconds one flush may claim.
const MAX_SECONDS_PER_REQUEST = 600;
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
// How far back an event may be dated (as in play telemetry).
const MAX_BACKDATE_MS = 6 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_TRACKED = 5000;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const RequestSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
  journalId: z.string().trim().uuid('journalId must be a uuid'),
  flushMsSinceOpen: z.number().int().min(0).max(MAX_SESSION_MS),
  found: z
    .array(
      z.object({
        label: z
          .string()
          .trim()
          .min(1)
          .max(MAX_DISCOVERY_LABEL_LENGTH * 4),
        msSinceOpen: z.number().int().min(0).max(MAX_SESSION_MS),
      }),
    )
    .max(MAX_LABELS_PER_REQUEST),
  playSeconds: z.number().int().min(0).max(MAX_SECONDS_PER_REQUEST).optional(),
});

export interface DiscoveryJournalRoutesOptions {
  store: Store;
  publishedSlugs?: PublishedSlugGate | null;
  now?: () => number;
}

// Whether this account keeps a journal at all.
export function isDiscoveryJournalOn(user: { uid: string; discoveryJournalSince?: string | null } | null): boolean {
  if (!user) return false;
  // Automation is not a player.
  if (user.uid.startsWith('bot:')) return false;
  return Boolean(user.discoveryJournalSince);
}

export async function registerDiscoveryJournalRoutes(
  app: FastifyInstance,
  options: DiscoveryJournalRoutesOptions,
): Promise<void> {
  const { store, publishedSlugs } = options;
  const now = options.now ?? Date.now;
  const requestsByUid = new Map<string, number[]>();
  // journalId -> labels already stored, so replays cannot grow it.
  const journals = new Map<string, Set<string>>();

  app.post('/api/discovery-journal', async (request, reply) => {
    const user = request.user;
    if (!user || user.tier === 'blocked' || !isDiscoveryJournalOn(user)) {
      return reply.status(202).send({ accepted: 0 });
    }
    const parsed = RequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    const currentTime = now();
    const hits = (requestsByUid.get(user.uid) ?? []).filter((at) => currentTime - at < RATE_LIMIT_WINDOW_MS);
    if (hits.length >= MAX_REQUESTS_PER_WINDOW) {
      rememberBounded(requestsByUid, user.uid, hits, MAX_TRACKED);
      return reply.status(429).send({ error: 'too many discovery journal requests' });
    }
    hits.push(currentTime);
    rememberBounded(requestsByUid, user.uid, hits, MAX_TRACKED);

    const { slug, journalId, flushMsSinceOpen, found, playSeconds } = parsed.data;
    if (!((await publishedSlugs?.isPublished(slug)) ?? false)) return reply.status(202).send({ accepted: 0 });

    function atIso(msSinceOpen: number): string {
      const backdate = Math.min(MAX_BACKDATE_MS, Math.max(0, flushMsSinceOpen - msSinceOpen));
      return new Date(currentTime - backdate).toISOString();
    }

    // Keyed by account so journals cannot share a budget.
    const key = `${user.uid}:${journalId}`;
    // Copy; committed only after the append succeeds.
    const seen = new Set(journals.get(key));
    const rows: Omit<DiscoveryRow, 'rowId' | 'day'>[] = [];
    for (const entry of found) {
      const label = entry.label.slice(0, MAX_DISCOVERY_LABEL_LENGTH);
      if (seen.has(label) || seen.size >= MAX_LABELS_PER_JOURNAL) continue;
      seen.add(label);
      rows.push({
        at: atIso(entry.msSinceOpen),
        uid: user.uid,
        slug,
        journalId,
        kind: 'found',
        label,
        msSinceOpen: entry.msSinceOpen,
      });
    }
    if (playSeconds !== undefined && playSeconds > 0) {
      rows.push({
        at: new Date(currentTime).toISOString(),
        uid: user.uid,
        slug,
        journalId,
        kind: 'play',
        seconds: playSeconds,
        msSinceOpen: flushMsSinceOpen,
      });
    }
    if (rows.length === 0) return reply.status(202).send({ accepted: 0 });

    try {
      await store.appendDiscoveryRows(rows);
    } catch (error) {
      // Never fail play over it; the shell must not retry.
      request.log.error({ err: error }, 'failed to append discovery journal rows');
      return reply.status(202).send({ accepted: 0 });
    }
    rememberBounded(journals, key, seen, MAX_TRACKED);
    return reply.status(202).send({ accepted: rows.length });
  });
}
