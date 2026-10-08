import type { FastifyInstance } from 'fastify';
import { isAdminSession } from '../platform/admin-session.js';
import { hasPublishableProfile } from '../platform/creator-profile.js';
import type { GamesStore } from '../delivery/games-store.js';
import { isPublishableMode } from '../platform/publication-state.js';
import { resolveGameAccess, sameOwner } from '../platform/game-access-resolve.js';
import type { Store } from '../platform/store.js';
import { loadJobPreview } from './job-admin-preview.js';
import {
  claimReviewedPublish,
  previewMatchesDelivery,
  resolveEditorialPublish,
  reviewedPublishError,
  supersedeOtherRounds,
} from './job-admin-publish.js';
import type { EditorialPublishCounts } from './job-admin-publish.js';

type PublishBody = { expectedVersion?: string; override?: boolean; overrideReason?: string };
type PublishEvent = { slug: string; version: string; gameTitle: string; ownerUid: string; jobId: number };

export async function registerJobAdminRoutes(
  app: FastifyInstance,
  options: {
    store?: Store;
    adminUids?: Set<string>;
    gamesStore?: GamesStore;
    now?: () => number;
    /**
     * Fans a new version out to the game's followers (game-follow-notify.ts). Optional:
     * a deployment without it publishes exactly as before, silently.
     */
    notifyFollowers?: (event: PublishEvent) => Promise<void>;
    // Policy at composition root, not a route invariant.
    editorialClearance?: (slug: string, version: string) => Promise<EditorialPublishCounts>;
  },
): Promise<void> {
  const { store, adminUids, gamesStore } = options;
  const now = options.now ?? Date.now;

  /**
   * Operator publish boundary: reread the green gate from the manifest, since job state
   * can be stale, and bind approval to the version the operator reviewed.
   */
  app.post<{ Params: { jobId: string }; Body: PublishBody }>(
    '/api/admin/jobs/:jobId/publish',
    async (request, reply) => {
      if (!isAdminSession(request, adminUids)) {
        return reply.code(404).send({ error: 'not_found' });
      }
      if (!store || !gamesStore) {
        return reply.code(503).send({ error: 'store_unavailable' });
      }

      const jobId = Number(request.params.jobId);
      if (!Number.isInteger(jobId)) {
        return reply.code(400).send({ error: 'invalid_job' });
      }

      const record = await store.getSubmission(jobId);
      if (!record) return reply.code(404).send({ error: 'not_found' });
      const expectedVersion = request.body?.expectedVersion;
      if (typeof expectedVersion !== 'string' || !expectedVersion) {
        return reply.code(400).send({ error: 'expected_version_required' });
      }
      if (!record.slug || !record.deliveredVersion) return reply.code(409).send({ error: 'nothing_delivered' });
      const reviewError = reviewedPublishError(record, expectedVersion);
      if (reviewError) return reply.code(409).send({ error: reviewError });

      // Creator-owned games need a publishable profile: the canonical owner's.
      const initialAccess = await resolveGameAccess(store, record.slug);
      const publishOwner = initialAccess.owner;
      if (publishOwner.kind === 'creator') {
        const owner = await store.getUser(publishOwner.uid);
        if (!hasPublishableProfile(owner)) {
          return reply.code(409).send({ error: 'profile_required' });
        }
      }

      const manifest = await gamesStore.getManifest(record.slug, record.deliveredVersion);
      if (!manifest?.gate) return reply.code(409).send({ error: 'not_gated' });
      if (!manifest.gate.green) return reply.code(409).send({ error: 'gate_red' });
      // A proposal is somebody else's change to this game, and a green gate on one says
      // only that it runs. It becomes publishable when the game's owner accepts it, which
      // rewrites the mode — so a version still in proposal mode has not been accepted, and
      // publishing it here would route around the one consent this feature depends on.
      // Read off the manifest rather than from the proposal registry deliberately: this
      // refusal must hold even for a caller who never heard of proposals.
      if (!isPublishableMode(manifest.deliveryMode)) {
        return reply.code(409).send({ error: 'not_publishable' });
      }

      const clearance = await resolveEditorialPublish({
        editorialClearance: options.editorialClearance,
        ownerUid: publishOwner.kind === 'creator' ? publishOwner.uid : record.ownerUid,
        slug: record.slug,
        version: record.deliveredVersion,
        body: request.body,
      });
      if ('status' in clearance) return reply.code(clearance.status).send(clearance.body);

      const latest = await resolveGameAccess(store, record.slug);
      const stale =
        latest.accessRevision !== initialAccess.accessRevision || !sameOwner(latest.owner, initialAccess.owner);
      if (stale) return reply.code(409).send({ error: 'owner_changed' });

      // Re-checked after every await above: a delivery may have landed meanwhile.
      const fresh = await store.getSubmission(jobId);
      if (!fresh || !previewMatchesDelivery(fresh, expectedVersion)) {
        return reply.code(409).send({ error: 'preview_superseded_delivery' });
      }

      const at = new Date(now()).toISOString();
      // Through `publishing` rather than straight to `published`: the intermediate state is
      // what a job is in while this is happening, and skipping it would leave no record
      // that it ever was — which is the state a failed publish has to fall back from.
      const claimed = await claimReviewedPublish(store, fresh, expectedVersion, at, clearance.reason);
      if (!claimed) return reply.code(409).send({ error: 'review_version_changed' });
      await store.setPublication({
        slug: record.slug,
        state: 'published',
        currentVersion: record.deliveredVersion,
        publishedAt: at,
      });
      await store.recordJobTransition(jobId, { to: 'published', at, by: 'operator', reason: 'published' });
      await store.setSubmissionPublishedAt(jobId, at);
      // The creator rail reads `lastStatus`, not `state`. Writing it here is what stops a
      // published game from also rendering as an in-progress "yours" card: the notify
      // sweep that normally keeps `lastStatus` current only walks *active* submissions,
      // and a terminal job is one sweep away from falling out of that set. `lastNotifiedStatus`
      // is left alone so the next sweep can still emit the published notification.
      await store.setSubmissionLastStatus(jobId, 'published');

      await supersedeOtherRounds(store, record.slug, jobId, at);

      // Best-effort follower fan-out; a failure never half-publishes.
      if (options.notifyFollowers) {
        try {
          await options.notifyFollowers({
            slug: record.slug,
            version: record.deliveredVersion,
            jobId,
            gameTitle: record.title,
            // Skipped as "already knows": that is the owner now, not the old row's.
            ownerUid: publishOwner.kind === 'creator' ? publishOwner.uid : record.ownerUid,
          });
        } catch (error) {
          request.log.error({ err: error, slug: record.slug }, 'follower notification fan-out failed after publish');
        }
      }

      return reply.send({ ok: true, slug: record.slug, version: record.deliveredVersion, publishedAt: at });
    },
  );

  // Sandboxed game preview for operator review before publishing.
  app.get<{ Params: { jobId: string } }>('/api/admin/jobs/:jobId/preview', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!store || !gamesStore) {
      return reply.code(503).send({ error: 'store_unavailable' });
    }
    const preview = await loadJobPreview(store, gamesStore, request.params.jobId);
    return reply.code(preview.status).send(preview.body);
  });
}
