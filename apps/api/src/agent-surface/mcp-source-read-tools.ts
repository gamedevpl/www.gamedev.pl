import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { canonicalAppBaseUrl } from '../platform/canonical-app-url.js';
import { moduleSizeWarnings } from '../creation/module-size.js';
import { DEFAULT_UPLOAD_URL_TTL_SECONDS, mintUploadToken } from './agent-upload-token.js';
import { sha256Hex, sourceArchive, sourceManifest, type SourceFile } from './source-archive.js';
import type { SourceStageToolEntry, SourceStageToolsDeps } from './mcp-source-stage-tools.js';
import { toolOk, toolErr, SESSION_KEY_PROP, WARNINGS_PROP } from './mcp-tool-support.js';

// A game's own sources: manifest first, contents on demand.

const READS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

// Below this size the whole tree beats a second call.
export const INLINE_SOURCES_MAX_CHARS = 20_000;
export const MAX_SOURCE_READ_FILES = 12;
// Small and always needed: kept inline when the rest is withheld.
const ALWAYS_INLINE = new Set(['GAME.json', 'SPEC.md']);

interface ChannelSources {
  error?: string;
  delivery?: { slug?: string; version?: string } | null;
  origin?: 'seed' | 'delivery' | null;
  files?: SourceFile[];
  notes?: string | null;
  references?: string[];
  seedStatus?: string;
}

const MANIFEST_PROP = {
  type: 'array',
  description: 'Every source file of this game: path, size, line count, sha256.',
  items: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      bytes: { type: 'number' },
      lines: { type: 'number' },
      sha256: { type: 'string' },
    },
    required: ['path', 'bytes', 'sha256'],
  },
} as const;

export function createSourceReadTools(
  deps: Pick<SourceStageToolsDeps, 'resolveAuth' | 'injectChannel' | 'agentTokenSecret' | 'now'>,
): Record<string, SourceStageToolEntry> {
  const { resolveAuth, injectChannel, agentTokenSecret, now } = deps;

  async function fetchSources(
    ctx: Parameters<SourceStageToolEntry['handler']>[1],
    channelToken: string,
  ): Promise<ChannelSources | string> {
    const res = await injectChannel(ctx.request, 'GET', AGENT_CHANNEL_ROUTES.SOURCES, channelToken);
    const body = res.json() as ChannelSources;
    return res.statusCode === 200 ? body : (body.error ?? `sources failed (${res.statusCode})`);
  }

  return {
    get_sources: {
      annotations: { title: 'Fetch existing game sources', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          available: { type: 'boolean', description: 'True means this game has files — continue them.' },
          origin: {
            type: ['string', 'null'],
            description: "'seed' = a generated round-0 draft; 'delivery' = a previous round's sources.",
          },
          delivery: { type: ['object', 'null'] },
          files: {
            type: 'array',
            description: 'File contents. When truncated is true this holds only GAME.json and SPEC.md.',
            items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
          },
          manifest: MANIFEST_PROP,
          truncated: {
            type: 'boolean',
            description:
              'True when files[] omits contents to save context; read them via archive or read_source_files.',
          },
          archive: {
            type: 'object',
            description:
              'The same sources as one .tar.gz (unpacks to <slug>/), for a client with a shell. GET url with ' +
              'exactly these headers; Authorization is the short-lived credential, the URL alone is not one.',
            properties: {
              url: { type: 'string' },
              method: { type: 'string', enum: ['GET'] },
              headers: { type: 'object', additionalProperties: { type: 'string' } },
              sha256: { type: 'string' },
              root: { type: 'string' },
              expiresAt: { type: 'string' },
            },
          },
          notes: { type: ['string', 'null'], description: 'Hand-off note from the round-0 draft, when there is one.' },
          references: {
            type: 'array',
            items: { type: 'string' },
            description: 'Published games the round-0 draft was modelled on, when there is one.',
          },
          seedStatus: { type: 'string', description: 'pending = a round-0 draft is still generating; call again.' },
          ...WARNINGS_PROP,
        },
        required: ['available', 'files', 'manifest'],
      },
      description:
        "Fetch this game's current sources — read in every round, including the first, before any scaffolding decision. " +
        'A new game already has files: a generated round-0 draft (origin=seed) whose references and notes come ' +
        'with it. A later round returns what the previous round delivered (origin=delivery). Either way, continue ' +
        'those files; never scaffold over them — available:true means they exist even when their contents are not inline. ' +
        `A small game comes back whole. A larger one returns manifest[] plus GAME.json and SPEC.md (truncated:true): ` +
        'read only the files you need, with read_source_files, or download archive once if you have a shell. ' +
        'Pass full:true to get every file inline. seedStatus=pending means a draft is still generating — browse the ' +
        'kit briefly and call this again rather than scaffolding. ' +
        'When warnings.code=module_too_large, split those oversized game/*.ts modules before adding features.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          full: { type: 'boolean', description: 'Return every file inline, however large the game is.' },
          version: {
            type: 'string',
            description: "Optional. Reserved; the channel returns the job's latest delivery or published version.",
          },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const body = await fetchSources(ctx, auth.channelToken);
        if (typeof body === 'string') return toolErr(body);

        const files = body.files ?? [];
        const sizeWarnings = moduleSizeWarnings(files);
        const totalChars = files.reduce((sum, file) => sum + file.content.length, 0);
        const slug = body.delivery?.slug ?? auth.record.slug ?? undefined;
        const withhold = args.full !== true && totalChars > INLINE_SOURCES_MAX_CHARS && Boolean(slug);
        const version = body.delivery?.version;
        const issuedAt = now();
        const token =
          withhold && agentTokenSecret
            ? mintUploadToken(agentTokenSecret, {
                jobId: auth.jobId,
                roundGeneration: auth.record.roundGeneration ?? auth.claims.roundGeneration ?? 1,
                kind: 'sources',
                ...(version ? { version } : {}),
                actorUid: auth.actorUid,
                actorRevision: auth.actorRevision,
                now: issuedAt,
                ttlSeconds: DEFAULT_UPLOAD_URL_TTL_SECONDS,
              })
            : undefined;
        const archive = token
          ? {
              url: `${canonicalAppBaseUrl()}${AGENT_CHANNEL_ROUTES.SOURCES_ARCHIVE}`,
              method: 'GET' as const,
              headers: { Authorization: `Bearer ${token}` },
              sha256: sha256Hex(sourceArchive(files, slug!)),
              root: slug!,
              expiresAt: new Date(issuedAt + DEFAULT_UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
            }
          : undefined;

        // Files decide; a round-0 draft counts as sources too.
        return toolOk({
          available: files.length > 0,
          origin: body.origin ?? (body.delivery ? 'delivery' : null),
          delivery: body.delivery ?? null,
          files: withhold ? files.filter((file) => ALWAYS_INLINE.has(file.path)) : files,
          manifest: sourceManifest(files),
          ...(withhold ? { truncated: true } : {}),
          ...(archive ? { archive } : {}),
          ...(body.notes ? { notes: body.notes } : {}),
          ...(body.references?.length ? { references: body.references } : {}),
          ...(body.seedStatus ? { seedStatus: body.seedStatus } : {}),
          ...(sizeWarnings.length ? { warnings: sizeWarnings } : {}),
        });
      },
    },

    read_source_files: {
      annotations: { title: "Read some of this game's source files", ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
          },
          rejected: {
            type: 'array',
            description: 'Paths that are not in this game, with why. The rest were read.',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, reason: { type: 'string' } },
              required: ['path', 'reason'],
            },
          },
        },
        required: ['files'],
      },
      description:
        `Read up to ${MAX_SOURCE_READ_FILES} of this game's source files by path (as listed in get_sources manifest[], ` +
        'relative to the slug). Same base as get_sources: the latest delivery, or the round-0 draft. ' +
        'Read a file before you patch it; patch_source_file needs its exact text.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          paths: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: MAX_SOURCE_READ_FILES,
            description: 'Paths from get_sources manifest[], e.g. game/runtime.ts.',
          },
        },
        required: ['paths'],
      },
      handler: async (args, ctx) => {
        const paths = Array.isArray(args.paths)
          ? [...new Set(args.paths.filter((path): path is string => typeof path === 'string' && path.trim() !== ''))]
          : [];
        if (paths.length === 0) return toolErr('paths must list at least one source file');
        if (paths.length > MAX_SOURCE_READ_FILES) {
          return toolErr(`too many paths (max ${MAX_SOURCE_READ_FILES}); split into several calls`);
        }
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const body = await fetchSources(ctx, auth.channelToken);
        if (typeof body === 'string') return toolErr(body);
        const byPath = new Map((body.files ?? []).map((file) => [file.path, file]));
        const files = paths.flatMap((path) => (byPath.has(path.trim()) ? [byPath.get(path.trim())!] : []));
        const rejected = paths
          .filter((path) => !byPath.has(path.trim()))
          .map((path) => ({ path, reason: 'not a source file of this game — see get_sources manifest[]' }));
        return toolOk({ files, ...(rejected.length ? { rejected } : {}) });
      },
    },
  };
}
