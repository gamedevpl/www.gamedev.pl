import { AVATAR_MODES } from '@gamedevpl/contract';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  HANDLE_RENAME_COOLDOWN_MS,
  hasPublishableProfile,
  normalizeHandle,
  PROFILE_BIO_MAX,
  PROFILE_NAME_MAX,
  profileBylineName,
  sanitizeProfileBio,
  sanitizeProfileName,
  toPublicCreatorProfile,
  validateHandleShape,
  type AvatarMode,
  type PublicCreatorProfile,
} from './creator-profile.js';
import { catalogEntryFromSpec, type CatalogGameEntry } from '../catalog/github-client.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { Store } from '../platform/store.js';

/**
 * Creator profiles — claim a handle, edit the public page, publish gate data.
 *
 * Building needs none of this. Publishing does. See the ops plan
 * `docs/creator-profiles-plan.md` (private repo); do not paste it here.
 */

const HandleParamsSchema = z.object({
  handle: z.string().trim().min(1).max(32),
});

const ClaimHandleSchema = z.object({
  handle: z.string().trim().min(1).max(32),
});

const UpdateProfileSchema = z.object({
  profileName: z.string().trim().min(1).max(PROFILE_NAME_MAX).optional(),
  bio: z.string().max(PROFILE_BIO_MAX).optional().nullable(),
  avatarMode: z.enum(AVATAR_MODES).optional(),
});

export interface CreatorProfileRoutesOptions {
  store: Store;
  /** Needed to list a creator's published games on the public profile. */
  gamesStore?: GamesStore | null;
  /** Repo-backed catalog lookup; this source wins in the public media route too. */
  getRepoPublishedCatalogEntry?: (slug: string) => Promise<CatalogGameEntry | null>;
  now?: () => number;
}

export interface MeProfileResponse {
  profile: PublicCreatorProfile | null;
  /** True when publish would succeed for profile completeness. */
  publishReady: boolean;
  handle?: string;
  profileName?: string;
  bio?: string;
  avatarMode?: AvatarMode;
  handleChangedAt?: string;
  /** Google picture URL when present — editor preview only, not a public claim. */
  picture?: string | null;
}

export interface PublicCreatorResponse {
  profile: PublicCreatorProfile;
  games: CatalogGameEntry[];
}

function requireUser(
  request: { user?: { uid: string; tier?: string } | null },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): boolean {
  if (!request.user) {
    reply.status(401).send({ error: 'authentication required' });
    return false;
  }
  if (request.user.tier === 'blocked') {
    reply.status(403).send({ error: 'account is blocked' });
    return false;
  }
  return true;
}

function meProfileBody(user: NonNullable<Awaited<ReturnType<Store['getUser']>>>): MeProfileResponse {
  return {
    profile: toPublicCreatorProfile(user),
    publishReady: hasPublishableProfile(user),
    handle: user.handle,
    profileName: user.profileName,
    bio: user.bio,
    avatarMode: user.avatarMode,
    handleChangedAt: user.handleChangedAt,
    picture: user.picture ?? null,
  };
}

export async function registerCreatorProfileRoutes(
  app: FastifyInstance,
  options: CreatorProfileRoutesOptions,
): Promise<void> {
  const { store, gamesStore, getRepoPublishedCatalogEntry } = options;
  const now = options.now ?? Date.now;

  app.get('/api/me/profile', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const user = await store.getUser(request.user!.uid);
    if (!user) return reply.status(404).send({ error: 'not_found' });
    return reply.send(meProfileBody(user));
  });

  app.put('/api/me/profile', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const body = UpdateProfileSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
    }

    const user = await store.getUser(request.user!.uid);
    if (!user) return reply.status(404).send({ error: 'not_found' });
    if (!user.handle) {
      return reply.status(409).send({ error: 'handle_required' });
    }

    const patch: { profileName?: string; bio?: string; avatarMode?: AvatarMode } = {};
    if (body.data.profileName !== undefined) {
      patch.profileName = sanitizeProfileName(body.data.profileName);
    }
    if (body.data.bio !== undefined) {
      patch.bio = body.data.bio === null ? '' : sanitizeProfileBio(body.data.bio);
    }
    if (body.data.avatarMode !== undefined) {
      patch.avatarMode = body.data.avatarMode;
    }

    const updated = await store.updateCreatorProfile(request.user!.uid, patch);
    if (!updated) return reply.status(404).send({ error: 'not_found' });
    return reply.send(meProfileBody(updated));
  });

  app.post(
    '/api/me/profile/handle',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      const body = ClaimHandleSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
      }

      const at = new Date(now()).toISOString();
      const result = await store.claimHandle(request.user!.uid, body.data.handle, at);
      if (!result.ok) {
        const status =
          result.reason === 'not_found'
            ? 404
            : result.reason === 'invalid' || result.reason === 'reserved'
              ? 400
              : result.reason === 'cooldown' || result.reason === 'unchanged'
                ? 409
                : 409;
        return reply.status(status).send({ error: result.reason });
      }
      return reply.send(meProfileBody(result.user));
    },
  );

  app.get(
    '/api/creators/:handle/availability',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireUser(request, reply)) return;
      const params = HandleParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'invalid handle' });
      }

      const key = normalizeHandle(params.data.handle);
      const shape = validateHandleShape(key);
      if (shape) return reply.send({ handle: key, available: false, reason: shape });

      // Use the reservation row, not getUserByHandle — released handles stay blocked for
      // the rename cooldown even though they no longer resolve to a public profile.
      const reservation = await store.getHandleReservation(key);
      if (reservation) {
        const uid = request.user!.uid;
        if (!reservation.releasedAt && reservation.uid !== uid) {
          return reply.send({ handle: key, available: false, reason: 'taken' as const });
        }
        if (reservation.releasedAt && reservation.previousUid !== uid) {
          const elapsed = now() - Date.parse(reservation.releasedAt);
          if (Number.isFinite(elapsed) && elapsed < HANDLE_RENAME_COOLDOWN_MS) {
            return reply.send({ handle: key, available: false, reason: 'taken' as const });
          }
        }
      }
      return reply.send({ handle: key, available: true });
    },
  );

  app.get('/api/creators/:handle', async (request, reply) => {
    const params = HandleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid handle' });
    }

    let user = await store.getUserByHandle(params.data.handle);
    let profile = user ? toPublicCreatorProfile(user) : null;
    if (!user || !profile) {
      // A renamed handle remains reserved during the cooldown. Resolve it to the
      // creator's current profile so links in catalog shares, posts, and bookmarks do
      // not break the moment they rename. Deleted accounts have no user document and
      // therefore fall through to the ordinary 404.
      const reservation = await store.getHandleReservation(params.data.handle);
      if (reservation?.releasedAt && reservation.previousUid) {
        const renamedUser = await store.getUser(reservation.previousUid);
        const renamedProfile = renamedUser ? toPublicCreatorProfile(renamedUser) : null;
        if (renamedUser?.handle && renamedProfile) {
          return reply.redirect(`/api/creators/${encodeURIComponent(renamedUser.handle)}`, 308);
        }
        user = renamedUser;
        profile = renamedProfile;
      }
      if (!user || !profile) {
        return reply.status(404).send({ error: 'not_found' });
      }
    }

    const games = await listCreatorPublishedGames(
      store,
      gamesStore ?? null,
      getRepoPublishedCatalogEntry,
      user.uid,
      profile,
    );
    const body: PublicCreatorResponse = { profile, games };
    return reply.send(body);
  });
}

async function listCreatorPublishedGames(
  store: Store,
  gamesStore: GamesStore | null,
  getRepoPublishedCatalogEntry: ((slug: string) => Promise<CatalogGameEntry | null>) | undefined,
  ownerUid: string,
  profile: PublicCreatorProfile,
): Promise<CatalogGameEntry[]> {
  const records = await store.listSubmissionsByOwner(ownerUid, { limit: 100 });
  // An improvement is a new job on an existing slug. When it publishes, both the
  // original and the revise tip carry `publishedAt`, so listing every published
  // record would put the same game on the profile twice. One card per slug —
  // same collapse the Studio shelf already does. `listSubmissionsByOwner` is
  // newest-first, so the first hit is the tip that won.
  const candidates = records.filter((record) => record.publishedAt && record.slug && !record.abandonedAt);
  const games: CatalogGameEntry[] = [];
  const seenSlugs = new Set<string>();

  for (const record of candidates) {
    const slug = record.slug!;
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    // archived / disabled publications must not stay on the public profile with a
    // dead Play button — same gate the play endpoint uses.
    const publication = await store.getPublication(slug);
    if (!publication || publication.state !== 'published') continue;

    // Match /api/games/:slug/media/:filename: a repo-backed catalog entry wins
    // whenever both the migrated repo copy and store delivery exist.
    let entry = getRepoPublishedCatalogEntry ? await getRepoPublishedCatalogEntry(slug) : null;
    if (!entry && gamesStore) {
      try {
        const version = publication.currentVersion ?? record.deliveredVersion;
        if (version) {
          const spec = await gamesStore.getSourceFile(slug, version, 'SPEC.md');
          if (spec) {
            // Gate captures are derived artifacts, not game sources. Reading only
            // SPEC.md here left every creator-profile poster empty even though the
            // catalog and media route could already serve the same screenshot.
            const mediaMetadata = await gamesStore.getDerivedArtifact(slug, version, 'media/metadata.json');
            entry = catalogEntryFromSpec(slug, spec, (name) =>
              name === 'media/metadata.json' && mediaMetadata ? mediaMetadata.toString('utf8') : null,
            );
          }
        }
      } catch {
        // A missing store object must not blank the whole profile.
      }
    }
    if (!entry) {
      entry = {
        slug,
        title: record.title,
        genre: '',
        controls: '',
        status: 'published',
        media: null,
        multiplayer: null,
        saves: null,
        world: null,
        sensing: null,
        orientation: 'any',
        submittedBy: profileBylineName(profile),
      };
    }
    games.push({
      ...entry,
      status: 'published',
      submittedBy: profileBylineName(profile),
      creatorHandle: profile.handle,
    });
  }

  games.sort((a, b) => a.title.localeCompare(b.title));
  return games;
}
