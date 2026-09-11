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

function invalid(message: string): string {
  return JSON.stringify({ ok: false, error: message });
}

export type AgentActivityPhase = 'start' | 'done';
export type AgentActivityEvent = {
  tool: string;
  at: number;
  phase: AgentActivityPhase;
  mutates: boolean;
  // Paths whose content changed — 'all' for a bufferwide clear, undefined if none.
  affectedPaths?: string[] | 'all';
};
type AgentActivityListener = (event: AgentActivityEvent) => void;

const activityListeners = new Set<AgentActivityListener>();

// Tools that change the working copy; the editor must reload after these.
const MUTATING_TOOLS = new Set(['stage_source_file', 'patch_source_file', 'clear_staged_sources', 'submit_sources']);

// Paths a call touches — lets the editor drop their stale drafts.
const AFFECTED_PATHS: Record<string, (input: Record<string, unknown>) => string[] | 'all' | undefined> = {
  stage_source_file: (input) => (typeof input.path === 'string' ? [input.path] : undefined),
  patch_source_file: (input) => (typeof input.path === 'string' ? [input.path] : undefined),
  clear_staged_sources: (input) => (Array.isArray(input.paths) ? input.paths.map(String) : 'all'),
};

// Studio's banner and its post-mutation source reload subscribe here.
export function subscribeAgentActivity(listener: AgentActivityListener): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

function notifyAgentActivity(tool: string, phase: AgentActivityPhase, affectedPaths?: string[] | 'all'): void {
  const event: AgentActivityEvent = { tool, at: Date.now(), phase, mutates: MUTATING_TOOLS.has(tool), affectedPaths };
  for (const listener of activityListeners) listener(event);
}

// Announce every call's start and end, whichever transport invoked it.
function withActivity(tool: ModelContextTool): ModelContextTool {
  return {
    ...tool,
    execute: async (input) => {
      notifyAgentActivity(tool.name, 'start');
      try {
        return await tool.execute(input);
      } finally {
        notifyAgentActivity(tool.name, 'done', AFFECTED_PATHS[tool.name]?.(input));
      }
    },
  };
}

export const AGENT_GUIDE = [
  'You are editing a browser game through the gamedev.pl Studio Code surface.',
  'These tools mirror the get_sources / stage_source_file / patch_source_file / ' +
    "clear_staged_sources / submit_sources contract used by gamedev.pl's regular MCP server " +
    '(the one MCP-capable coding agents connect to) — same names, same shapes.',
  '',
  'Loop: get_sources -> edit with patch_source_file (old/new or a unified diff) or ' +
    'stage_source_file (full rewrite) -> submit_sources to build a preview.',
  '',
  'If you reached this page as a browser agent that cannot call tools directly, use the ' +
    'agent console in the Agent mode dialog: type one JSON command per run, ' +
    'shaped {"tool":"get_sources","input":{}}, press Run, then read the newest result at the ' +
    'top of the list below — every past command and result stays visible there too.',
  '',
  'shared/ and tools/ are read-only — shared engine code, never edited from a single game round.',
  'submit_sources only ever builds a PREVIEW here. Publishing is a deliberate action the creator',
  'takes themselves with the Studio "Opublikuj" button — no tool here can publish.',
].join('\n');

function agentModeStorageKey(slug: string): string {
  return `webmcp-agent-mode:${slug}`;
}

// Opt-in lives in sessionStorage: this tab only, gone when it closes.
export function isAgentModeEnabled(slug: string): boolean {
  try {
    return window.sessionStorage.getItem(agentModeStorageKey(slug)) === '1';
  } catch {
    return false;
  }
}

export function setAgentModeEnabled(slug: string, enabled: boolean): void {
  try {
    if (enabled) window.sessionStorage.setItem(agentModeStorageKey(slug), '1');
    else window.sessionStorage.removeItem(agentModeStorageKey(slug));
  } catch {
    // Best-effort — a private-browsing tab just won't remember the choice.
  }
}

// One definition list, shared by WebMCP registration and the console.
function buildCodeSurfaceTools(slug: string): ModelContextTool[] {
  const tools: ModelContextTool[] = [
    {
      name: 'get_sources',
      description: "Fetch this round's game sources — every file's path and full working-copy content.",
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
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
    },
    {
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
        if (typeof input.path !== 'string' || !input.path) return invalid('path is required');
        if (typeof input.content !== 'string') return invalid('content is required');
        try {
          const result = await stageCodeSurfaceFile(slug, input.path, input.content, { agentAuthored: true });
          return ok({ ok: true, path: result.path, bytes: result.bytes });
        } catch (error) {
          return failure(error);
        }
      },
    },
    {
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
        if (typeof input.path !== 'string' || !input.path) return invalid('path is required');
        if (typeof input.patch !== 'string' && (typeof input.old !== 'string' || typeof input.new !== 'string')) {
          return invalid('pass old+new or patch');
        }
        try {
          const edit =
            typeof input.patch === 'string'
              ? { patch: input.patch }
              : { old: input.old as string, new: input.new as string };
          const result = await patchCodeSurfaceFile(slug, input.path, edit, { agentAuthored: true });
          return ok({ ok: true, path: result.path, bytes: result.bytes, replacements: result.replacements });
        } catch (error) {
          return failure(error);
        }
      },
    },
    {
      name: 'clear_staged_sources',
      description: 'Clear unpublished working-copy edits — all of them, or only the given paths.',
      inputSchema: {
        type: 'object',
        properties: { paths: { type: 'array', items: { type: 'string' } } },
      },
      execute: async (input) => {
        const paths = Array.isArray(input.paths) ? input.paths.map(String) : undefined;
        try {
          const result = await discardCodeSurfaceEdits(slug, paths);
          return ok({ ok: true, cleared: result.cleared });
        } catch (error) {
          return failure(error);
        }
      },
    },
    {
      name: 'submit_sources',
      description:
        'Build a PREVIEW from the working copy so the creator can play the latest edits. Never publishes — ' +
        'publishing is a separate action only the creator takes, from the Studio "Opublikuj" button.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        try {
          const outcome = await deliverCodeSurface(slug, 'preview');
          return ok({ ok: outcome.accepted, ...outcome });
        } catch (error) {
          return failure(error);
        }
      },
    },
    {
      name: 'studio_get_agent_guide',
      description: "Read this before editing: the intended tool-call order and this round's guardrails.",
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
        return AGENT_GUIDE;
      },
    },
  ];
  return tools.map(withActivity);
}

// Names are slug-independent, so any slug builds the same list.
export function codeSurfaceToolNames(): string[] {
  return buildCodeSurfaceTools('').map((tool) => tool.name);
}

// Cleanup aborts every registration via one shared AbortSignal.
export function registerCodeSurfaceWebMcpTools(slug: string): () => void {
  const modelContext = getModelContext();
  if (!modelContext) return () => {};

  const controller = new AbortController();
  const options = { signal: controller.signal };

  for (const tool of buildCodeSurfaceTools(slug)) {
    // Advisory only — a rejected registration must never break the code editor.
    void modelContext.registerTool(tool, options).catch(() => {});
  }

  return () => controller.abort();
}

export type AgentConsoleResult = { ok: boolean; tool: string | null; output: string };

function consoleError(message: string): AgentConsoleResult {
  return { ok: false, tool: null, output: JSON.stringify({ ok: false, error: message }) };
}

// DOM fallback for browser agents that can type but cannot call tools.
export async function runAgentConsoleCommand(slug: string, raw: string): Promise<AgentConsoleResult> {
  const trimmed = raw.trim();
  if (!trimmed) return consoleError('empty command — expected {"tool":"get_sources","input":{}}');

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return consoleError('invalid JSON — expected {"tool":"get_sources","input":{}}');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return consoleError('expected a JSON object like {"tool":"get_sources","input":{}}');
  }

  const command = parsed as Record<string, unknown>;
  const requested = typeof command.tool === 'string' ? command.tool : command.name;
  if (typeof requested !== 'string' || !requested) {
    return consoleError(`missing "tool" — one of: ${codeSurfaceToolNames().join(', ')}`);
  }

  const tool = buildCodeSurfaceTools(slug).find((entry) => entry.name === requested);
  if (!tool) {
    return consoleError(`unknown tool "${requested}" — one of: ${codeSurfaceToolNames().join(', ')}`);
  }

  const rawInput = command.input ?? command.arguments ?? command.args ?? {};
  if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
    return consoleError('"input" must be a JSON object');
  }

  try {
    const output = await tool.execute(rawInput as Record<string, unknown>);
    return { ok: true, tool: tool.name, output };
  } catch (error) {
    // Tools handle their own errors; this catches anything unexpected.
    return { ok: false, tool: tool.name, output: failure(error) };
  }
}
