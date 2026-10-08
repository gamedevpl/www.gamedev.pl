import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES, withoutRetiredPaths } from '@gamedevpl/contract';
import type { GamesStore } from '../delivery/games-store.js';
import { resolveAuthorizedRoundBaseVersion } from '../platform/round-base-version.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { UploadKind, UploadTokenClaims } from './agent-upload-token.js';
import { seedPayload } from './seed-status.js';
import { sourceArchive, sourceRevision, type SourceFile } from './source-archive.js';

export interface AgentChannelSourcesRoutesDeps {
  resolveBuild: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ jobId: number; record: SubmissionRecord; actorUid?: string } | null>;
  resolveUploadBuild: (
    request: FastifyRequest,
    reply: FastifyReply,
    expectedKind: UploadKind,
  ) => Promise<{ jobId: number; record: SubmissionRecord; upload: UploadTokenClaims } | null>;
  store: Store | undefined;
  gamesStore: GamesStore | undefined;
}

type RoundSources =
  | { kind: 'seed'; slug: string; files: SourceFile[]; record: SubmissionRecord }
  | { kind: 'delivery'; slug: string; version: string; files: SourceFile[] }
  | { kind: 'none' }
  | { kind: 'broken' };

// Round base: own candidate, sibling, publication, or round 0.
async function loadRoundSources(
  store: Store,
  gamesStore: GamesStore,
  record: SubmissionRecord,
  actorUid: string | undefined,
  log: FastifyRequest['log'],
): Promise<RoundSources> {
  const slug = record.slug;
  const version = slug ? await resolveAuthorizedRoundBaseVersion(store, record, slug, actorUid) : null;

  // Round 0 arrives here too: one read for every round.
  if (slug && !version && (record.seed?.files.length ?? 0) > 0) {
    const files = withoutRetiredPaths(record.seed!.files).map((file) => ({ path: file.path, content: file.content }));
    return { kind: 'seed', slug, files, record };
  }
  if (!slug || !version) return { kind: 'none' };

  const manifest = await gamesStore.getManifest(slug, version);
  if (!manifest) {
    log.error({ slug, version }, 'delivered version has no manifest — the store lost a version a job still points at');
    return { kind: 'broken' };
  }
  const files = await Promise.all(
    manifest.sourceFiles.map(async (path) => ({ path, content: await gamesStore.getSourceFile(slug, version, path) })),
  );
  // A hole would have the agent "restore" a deletion it never made.
  const missing = files.filter((file) => file.content === null).map((file) => file.path);
  if (missing.length > 0) {
    log.error({ slug, version, missing }, 'delivered version is missing files its manifest lists');
    return { kind: 'broken' };
  }
  return { kind: 'delivery', slug, version, files: files as SourceFile[] };
}

export function registerAgentChannelSourcesRoutes(app: FastifyInstance, deps: AgentChannelSourcesRoutesDeps): void {
  const { resolveBuild, resolveUploadBuild, store, gamesStore } = deps;

  /**
   * Hands a build back the sources it should continue from.
   *
   * The channel was upload-only, and that quietly made the agent's *branch* the real
   * home of a game: a follow-up session could only continue the work if it happened to
   * land on the same branch, and when it did not — which is what happens whenever the
   * branch is unknown at resume time — the creator's game started again from nothing.
   * The store already holds every delivered version, immutably; this is the read that
   * makes it the source of truth rather than a copy nobody can get back.
   *
   * Prefer the job's own latest candidate — previewVersion first (mode=preview may be
   * the only upload so far, or a fix after a red publish), then deliveredVersion. A new
   * sibling round inherits the newest eligible sibling delivery before the live
   * publication. Without that, `npm run restore` reports nothing to restore and the
   * agent rebuilds a stranger's game instead of revising what the creator played.
   *
   * Scoped to the job's own game by the same token that authorizes its delivery, so a
   * build can restore what it (or its published predecessor) delivered and nothing else.
   */
  app.get(
    AGENT_CHANNEL_ROUTES.SOURCES,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      if (!gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }
      const sources = await loadRoundSources(store!, gamesStore, resolved.record, resolved.actorUid, request.log);
      switch (sources.kind) {
        case 'seed':
          return reply.send({
            delivery: null,
            origin: 'seed',
            files: sources.files,
            references: sources.record.seed!.references,
            notes: sources.record.seed!.notes ?? null,
            ...seedPayload(sources.record),
          });
        case 'none':
          // Nothing drafted and nothing delivered; seedStatus says whether to wait.
          return reply.send({ delivery: null, origin: null, files: [], ...seedPayload(resolved.record) });
        case 'broken':
          return reply.status(502).send({ error: 'the delivered version could not be read back' });
        case 'delivery':
          return reply.send({
            delivery: { slug: sources.slug, version: sources.version },
            origin: 'delivery',
            files: sources.files,
          });
      }
    },
  );

  // The same base as one .tar.gz behind a signed GET.
  app.get(
    AGENT_CHANNEL_ROUTES.SOURCES_ARCHIVE,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveUploadBuild(request, reply, 'sources');
      if (!resolved) return reply;
      if (!gamesStore) {
        return reply.status(503).send({ error: 'delivery is not configured on this deployment' });
      }
      const { record, upload } = resolved;
      const sources = await loadRoundSources(store!, gamesStore, record, upload.actorUid, request.log);
      if (sources.kind === 'broken') {
        return reply.status(502).send({ error: 'the delivered version could not be read back' });
      }
      if (sources.kind === 'none') return reply.status(404).send({ error: 'this game has no sources yet' });
      // A newer base than the minted version needs a fresh get_sources.
      const version = sources.kind === 'delivery' ? sources.version : undefined;
      if (upload.version !== sourceRevision(version, sources.files, sources.slug)) {
        return reply
          .status(409)
          .send({ error: 'the sources changed since this URL was minted — call get_sources again' });
      }
      return reply
        .header('content-type', 'application/gzip')
        .header('content-disposition', `attachment; filename="${sources.slug}-sources.tgz"`)
        .send(sourceArchive(sources.files, sources.slug));
    },
  );
}
