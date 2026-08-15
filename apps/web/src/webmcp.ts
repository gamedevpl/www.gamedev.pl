// WebMCP tools mirroring the BYOCA MCP contract (mcp-server.ts); shell only.
import {
  CodeSurfaceApiError,
  deliverCodeSurface,
  discardCodeSurfaceEdits,
  fetchCodeSurfaceSources,
  patchCodeSurfaceFile,
  stageCodeSurfaceFile,
} from './codeSurfaceApi.js';

type ModelContextToolAnnotations = { readOnlyHint?: boolean; untrustedContentHint?: boolean };

type ModelContextTool = {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  execute: (input: Record<string, unknown>) => Promise<string>;
  annotations?: ModelContextToolAnnotations;
};

type ModelContextLike = {
  registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => Promise<void>;
};

declare global {
  interface Navigator {
    modelContext?: ModelContextLike;
  }
  interface Document {
    modelContext?: ModelContextLike;
  }
}

// document.modelContext, falling back to navigator.modelContext.
function getModelContext(): ModelContextLike | null {
  if (typeof document !== 'undefined' && document.modelContext) return document.modelContext;
  if (typeof navigator !== 'undefined' && navigator.modelContext) return navigator.modelContext;
  return null;
}

function ok(value: unknown): string {
  return JSON.stringify(value);
}

function failure(error: unknown): string {
  const message = error instanceof CodeSurfaceApiError ? error.message : 'request failed';
  return JSON.stringify({ ok: false, error: message });
}

export type AgentActivityEvent = { tool: string; at: number };
type AgentActivityListener = (event: AgentActivityEvent) => void;

const activityListeners = new Set<AgentActivityListener>();

// Studio's "agent is editing" banner subscribes here.
export function subscribeAgentActivity(listener: AgentActivityListener): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

function notifyAgentActivity(tool: string): void {
  const event: AgentActivityEvent = { tool, at: Date.now() };
  for (const listener of activityListeners) listener(event);
}

const AGENT_GUIDE = [
  'You are editing a browser game through the gamedev.pl Studio Code surface, over WebMCP.',
  'These tools mirror the get_sources / stage_source_file / patch_source_file / ' +
    "clear_staged_sources / submit_sources contract used by gamedev.pl's regular MCP server " +
    '(the one Claude Desktop, Claude Code, Cursor etc. connect to) — same names, same shapes.',
  '',
  'Loop: get_sources -> edit with patch_source_file (old/new or a unified diff) or ' +
    'stage_source_file (full rewrite) -> submit_sources to build a preview.',
  '',
  'shared/ and tools/ are read-only — shared engine code, never edited from a single game round.',
  'submit_sources only ever builds a PREVIEW here. Publishing is a deliberate action the creator',
  'takes themselves with the Studio "Opublikuj" button — no tool here can publish.',
].join('\n');

function agentModeStorageKey(slug: string): string {
  return `webmcp-agent-mode:${slug}`;
}

// Creator opt-in, per round — off by default, read/written from localStorage.
export function isAgentModeEnabled(slug: string): boolean {
  try {
    return window.localStorage.getItem(agentModeStorageKey(slug)) === '1';
  } catch {
    return false;
  }
}

export function setAgentModeEnabled(slug: string, enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(agentModeStorageKey(slug), '1');
    else window.localStorage.removeItem(agentModeStorageKey(slug));
  } catch {
    // Best-effort — a private-browsing tab just won't remember the choice.
  }
}

// Cleanup aborts every registration via one shared AbortSignal.
export function registerCodeSurfaceWebMcpTools(slug: string): () => void {
  const modelContext = getModelContext();
  if (!modelContext) return () => {};

  const controller = new AbortController();
  const options = { signal: controller.signal };

  const register = (tool: ModelContextTool) => {
    // Advisory only — a rejected registration must never break the code editor.
    void modelContext.registerTool(tool, options).catch(() => {});
  };

  register({
    name: 'get_sources',
    description: "Fetch this round's game sources — every file's path and full working-copy content.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      notifyAgentActivity('get_sources');
      try {
        const sources = await fetchCodeSurfaceSources(slug);
        return ok({
          available: sources.files.length > 0,
          files: sources.files.map((file) => ({ path: file.path, content: file.content })),
        });
      } catch (error) {
        return failure(error);
      }
    },
  });

  register({
    name: 'stage_source_file',
    description:
      'Upload one game source file into the working copy (full rewrite). Prefer patch_source_file for edits.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Game-relative path, e.g. game.ts.' },
        content: { type: 'string', description: 'File contents (utf8 text).' },
      },
      required: ['path', 'content'],
    },
    execute: async (input) => {
      notifyAgentActivity('stage_source_file');
      const path = String(input.path ?? '');
      const content = String(input.content ?? '');
      try {
        const result = await stageCodeSurfaceFile(slug, path, content);
        return ok({ ok: true, path: result.path, bytes: result.bytes });
      } catch (error) {
        return failure(error);
      }
    },
  });

  register({
    name: 'patch_source_file',
    description:
      'Edit one file in the working copy without re-uploading it whole. Pass old+new (exact unique ' +
      'substring replace) or patch (a unified diff). old must match exactly once.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old: { type: 'string', description: 'Exact text to find — pass together with new.' },
        new: { type: 'string', description: 'Replacement text — pass together with old.' },
        patch: { type: 'string', description: 'Unified diff for this file — alternative to old/new.' },
      },
      required: ['path'],
    },
    execute: async (input) => {
      notifyAgentActivity('patch_source_file');
      const path = String(input.path ?? '');
      try {
        const edit =
          typeof input.patch === 'string'
            ? { patch: input.patch }
            : { old: String(input.old ?? ''), new: String(input.new ?? '') };
        const result = await patchCodeSurfaceFile(slug, path, edit);
        return ok({ ok: true, path: result.path, bytes: result.bytes, replacements: result.replacements });
      } catch (error) {
        return failure(error);
      }
    },
  });

  register({
    name: 'clear_staged_sources',
    description: 'Clear unpublished working-copy edits — all of them, or only the given paths.',
    inputSchema: {
      type: 'object',
      properties: { paths: { type: 'array', items: { type: 'string' } } },
    },
    execute: async (input) => {
      notifyAgentActivity('clear_staged_sources');
      const paths = Array.isArray(input.paths) ? input.paths.map(String) : undefined;
      try {
        const result = await discardCodeSurfaceEdits(slug, paths);
        return ok({ ok: true, cleared: result.cleared });
      } catch (error) {
        return failure(error);
      }
    },
  });

  register({
    name: 'submit_sources',
    description:
      'Build a PREVIEW from the working copy so the creator can play the latest edits. Never publishes — ' +
      'publishing is a separate action only the creator takes, from the Studio "Opublikuj" button.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      notifyAgentActivity('submit_sources');
      try {
        const outcome = await deliverCodeSurface(slug, 'preview');
        return ok({ ok: outcome.accepted, ...outcome });
      } catch (error) {
        return failure(error);
      }
    },
  });

  register({
    name: 'studio_get_agent_guide',
    description: "Read this before editing: the intended tool-call order and this round's guardrails.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      notifyAgentActivity('studio_get_agent_guide');
      return AGENT_GUIDE;
    },
  });

  return () => controller.abort();
}
