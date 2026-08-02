import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  hasPublishableProfile,
  PROFILE_BIO_MAX,
  PROFILE_NAME_MAX,
  profileBylineName,
  sanitizeProfileBio,
  sanitizeProfileName,
  toPublicCreatorProfile,
  type AvatarMode,
  type PublicCreatorProfile,
} from './creator-profile.js';
import { catalogEntryFromSpec, type CatalogGameEntry } from './github-client.js';
import type { GamesStore } from './games-store.js';
import type { Store } from './store.js';

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
  avatarMode: z.enum(['google', 'letter']).optional(),
});

export interface CreatorProfileRoutesOptions {
  store: Store;
  /** Needed to list a creator's published games on the public profile. */
  gamesStore?: GamesStore | null;
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
  const { store, gamesStore } = options;
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

      const { validateHandleShape, normalizeHandle } = await import('./creator-profile.js');
      const key = normalizeHandle(params.data.handle);
      const shape = validateHandleShape(key);
      if (shape) return reply.send({ handle: key, available: false, reason: shape });

      const holder = await store.getUserByHandle(key);
      if (holder && holder.uid !== request.user!.uid) {
        return reply.send({ handle: key, available: false, reason: 'taken' as const });
      }
      return reply.send({ handle: key, available: true });
    },
  );

  app.get('/api/creators/:handle', async (request, reply) => {
    const params = HandleParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid handle' });
    }

    const user = await store.getUserByHandle(params.data.handle);
    const profile = user ? toPublicCreatorProfile(user) : null;
    if (!user || !profile) {
      return reply.status(404).send({ error: 'not_found' });
    }

    const games = await listCreatorPublishedGames(store, gamesStore ?? null, user.uid, profile);
    const body: PublicCreatorResponse = { profile, games };
    return reply.send(body);
  });
}

async function listCreatorPublishedGames(
  store: Store,
  gamesStore: GamesStore | null,
  ownerUid: string,
  profile: PublicCreatorProfile,
): Promise<CatalogGameEntry[]> {
  const records = await store.listSubmissionsByOwner(ownerUid, { limit: 100 });
  const published = records.filter((record) => record.publishedAt && record.slug && !record.abandonedAt);
  const games: CatalogGameEntry[] = [];

  for (const record of published) {
    const slug = record.slug!;
    let entry: CatalogGameEntry | null = null;
    if (gamesStore) {
      try {
        const publication = await store.getPublication(slug);
        const version = publication?.currentVersion ?? record.deliveredVersion;
        if (version) {
          const spec = await gamesStore.getSourceFile(slug, version, 'SPEC.md');
          if (spec) entry = catalogEntryFromSpec(slug, spec, () => null);
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
