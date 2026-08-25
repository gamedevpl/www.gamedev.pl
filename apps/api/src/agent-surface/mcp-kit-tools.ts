import type { FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import {
  toolOk,
  toolErr,
  BEHAVIOURAL_CONTRACT,
  SESSION_KEY_PROP,
  KIT_ENGINE_REF_PROP,
  MCP_VISIBLE_TOOLS,
  type ToolContext,
  type ToolHandler,
  type ToolResult,
} from './mcp-tool-support.js';

const READS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function withAdvertisedBrowseTools<T extends { browse?: Record<string, string> }>(body: T): T {
  if (!body.browse) return body;
  const advertised = Object.entries(body.browse).filter(([, tool]) => MCP_VISIBLE_TOOLS.has(tool));
  const { browse: _browse, ...rest } = body;
  return (advertised.length ? { ...rest, browse: Object.fromEntries(advertised) } : rest) as T;
}

export interface KitToolsDeps {
  resolveAuth: (ctx: ToolContext, args: Record<string, unknown>) => Promise<{ channelToken: string } | ToolResult>;
  injectChannel: (
    request: FastifyRequest,
    method: 'GET' | 'POST',
    path: string,
    channelToken: string,
    body?: Record<string, unknown>,
  ) => Promise<{ statusCode: number; json: () => unknown }>;
}

export interface KitToolEntry {
  annotations: { title: string } & typeof READS;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// The Creator Kit orientation cluster: fetch, API digest, list, search.
export function createKitTools(deps: KitToolsDeps): Record<string, KitToolEntry> {
  const { resolveAuth, injectChannel } = deps;

  return {
    get_kit: {
      annotations: { title: 'Fetch the Creator Kit', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          engineRef: { type: 'string' },
          kitUrl: { type: 'string' },
          sha256: { type: 'string' },
          unpack: { type: 'string' },
          entry: { type: 'string' },
          kitEngineChanged: { type: 'boolean' },
          browse: {
            type: 'object',
            properties: {
              list: { type: 'string' },
              search: { type: 'string' },
              read: { type: 'string' },
              readMany: { type: 'string' },
              fragment: { type: 'string' },
            },
          },
        },
        required: ['engineRef', 'kitUrl', 'sha256', 'unpack', 'entry'],
      },
      description:
        'Fetch Creator Kit metadata: engineRef (required for submit_sources), sha256, entry, ' +
        'and optional kitUrl/unpack for agents with shell egress. ' +
        'engineRef is pinned for the round: repeat calls return the same engine even if the ' +
        'registry moves. kitEngineChanged:true means the pin was replaced — after a kit_outdated ' +
        'verdict, or because the pinned kit is no longer retained — so rebuild against the ' +
        'engine in this reply. ' +
        'This platform and its Creator Kit are not on the public web — an unanswered question ' +
        'about what it can build (multiplayer, persistent worlds, party games, …) is answered by ' +
        'get_kit_api or browse, never by web search. ' +
        'For the API itself: get_kit_api (with this engineRef) for a prompt-ready orientation in ' +
        'one call — it flags what it had to cut (by name when a whole declaration is dropped, by ' +
        'count when a kept one is trimmed member-wise), so a missing signature is never silent; ' +
        "use the browse tools named in this reply's browse block (list/search/read) for those or " +
        'any other specific kit file. ' +
        'With shell egress, kitUrl/unpack lets you unpack the kit locally and read SKILL.md directly. ' +
        'entry=gamedevpl-creator-kit/SKILL.md (tarball roots at gamedevpl-creator-kit/; ' +
        'do not assume a `cd` persists across tool calls). ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: { sessionKey: SESSION_KEY_PROP },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const res = await injectChannel(ctx.request, 'GET', AGENT_CHANNEL_ROUTES.KIT, auth.channelToken);
        const body = res.json() as { error?: string; message?: string; browse?: Record<string, string> };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `kit failed (${res.statusCode})`, body);
        }
        return toolOk(withAdvertisedBrowseTools(body));
      },
    },

    get_kit_api: {
      annotations: { title: "Fetch the Creator Kit's API reference", ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          engineRef: { type: 'string' },
          digest: { type: 'string' },
        },
        required: ['engineRef', 'digest'],
      },
      description:
        "The Creator Kit's prompt-ready orientation in one call: what engine modules exist " +
        '(party for same-screen multiplayer, zone for a real-time server-arbitrated world, ' +
        'commons and presence for persistent/shared state, and the rest — this is the answer ' +
        'to "can this platform build X", not a web search), plus as much of the core API ' +
        'signatures, audio catalog, and exemplar game as fit in one tool result. ' +
        'The response is sized to a safe single-call limit, not to the whole API — for a real ' +
        'kit this routinely omits content: whole declarations dropped are named in an "Omitted ' +
        'for length" note, and a declaration too large to fit whole is trimmed member-wise with ' +
        'only a count of what was cut, not names. Treat both as normal, not an error. ' +
        'Call this once near ' +
        'the start of a round, before scaffolding, rather than repeatedly — its content only ' +
        'changes when engineRef does. Pass engineRef from get_kit so a mid-round registry bump ' +
        "cannot mix kit revisions. Falls back to the registry's current engine when engineRef is " +
        'omitted, but that risks reading a different kit than the round is pinned to. ' +
        'Gives that orientation without unpacking the whole kit into context; the browse tools ' +
        '(list_kit_files / search_kit_files / read_kit_file) cover anything this digest omitted, ' +
        'summarized, or named in its omission note. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: { sessionKey: SESSION_KEY_PROP, engineRef: KIT_ENGINE_REF_PROP },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const params = new URLSearchParams();
        if (typeof args.engineRef === 'string' && args.engineRef.trim()) {
          params.set('engineRef', args.engineRef.trim());
        }
        const qs = params.toString();
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.KIT_API}${qs ? `?${qs}` : ''}`,
          auth.channelToken,
        );
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `get_kit_api failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },

    list_kit_files: {
      annotations: { title: 'List Creator Kit files', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          engineRef: { type: 'string' },
          entry: { type: 'string' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                bytes: { type: 'number' },
                kind: { type: 'string', enum: ['text', 'binary'] },
              },
              required: ['path', 'bytes', 'kind'],
            },
          },
          total: { type: 'number' },
          truncated: { type: 'boolean' },
        },
        required: ['engineRef', 'entry', 'files', 'total', 'truncated'],
      },
      description:
        'List paths inside a pinned Creator Kit (size + text/binary kind). ' +
        'Pass engineRef from get_kit. Optional prefix (e.g. shared/modules) or simple glob (*). ' +
        'Paginate with limit/offset. Start from get_kit.entry via read_kit_file. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          engineRef: KIT_ENGINE_REF_PROP,
          prefix: { type: 'string', description: 'Path prefix under the kit root (or full gamedevpl-creator-kit/…).' },
          glob: { type: 'string', description: 'Simple glob with * wildcards (e.g. **/*.md or shared/modules/*.ts).' },
          limit: { type: 'integer', description: 'Max paths to return (default 200, max 500).' },
          offset: { type: 'integer', description: 'Skip this many matching paths.' },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const params = new URLSearchParams();
        if (typeof args.engineRef === 'string' && args.engineRef.trim()) {
          params.set('engineRef', args.engineRef.trim());
        }
        if (typeof args.prefix === 'string' && args.prefix.trim()) params.set('prefix', args.prefix.trim());
        if (typeof args.glob === 'string' && args.glob.trim()) params.set('glob', args.glob.trim());
        if (typeof args.limit === 'number' && Number.isFinite(args.limit)) params.set('limit', String(args.limit));
        if (typeof args.offset === 'number' && Number.isFinite(args.offset)) params.set('offset', String(args.offset));
        const qs = params.toString();
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.KIT_FILES}${qs ? `?${qs}` : ''}`,
          auth.channelToken,
        );
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `list_kit_files failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },

    search_kit_files: {
      annotations: { title: 'Search Creator Kit files', ...READS },
      outputSchema: {
        type: 'object',
        properties: {
          engineRef: { type: 'string' },
          query: { type: 'string' },
          matches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                line: { type: 'number' },
                text: { type: 'string' },
              },
              required: ['path', 'line', 'text'],
            },
          },
          truncated: { type: 'boolean' },
          filesScanned: { type: 'number' },
        },
        required: ['engineRef', 'query', 'matches', 'truncated', 'filesScanned'],
      },
      description:
        'Search text files in a pinned Creator Kit for a substring (case-insensitive). ' +
        'Pass engineRef from get_kit. Returns path + line + snippet; capped match count. ' +
        BEHAVIOURAL_CONTRACT,
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          engineRef: KIT_ENGINE_REF_PROP,
          query: { type: 'string', description: 'Substring to find (2–120 chars).' },
          prefix: { type: 'string', description: 'Optional path prefix to narrow the search.' },
          limit: { type: 'integer', description: 'Max matches (default/max 40).' },
        },
        required: ['query'],
      },
      handler: async (args, ctx) => {
        const auth = await resolveAuth(ctx, args);
        if (!('channelToken' in auth)) return auth;
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        if (!query) return toolErr('query is required');
        const params = new URLSearchParams({ q: query });
        if (typeof args.engineRef === 'string' && args.engineRef.trim()) {
          params.set('engineRef', args.engineRef.trim());
        }
        if (typeof args.prefix === 'string' && args.prefix.trim()) params.set('prefix', args.prefix.trim());
        if (typeof args.limit === 'number' && Number.isFinite(args.limit)) params.set('limit', String(args.limit));
        const res = await injectChannel(
          ctx.request,
          'GET',
          `${AGENT_CHANNEL_ROUTES.KIT_SEARCH}?${params.toString()}`,
          auth.channelToken,
        );
        const body = res.json() as { error?: string; message?: string };
        if (res.statusCode !== 200) {
          return toolErr(body.message ?? body.error ?? `search_kit_files failed (${res.statusCode})`, body);
        }
        return toolOk(body);
      },
    },
  };
}
