// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as codeSurfaceApi from './codeSurfaceApi.js';

vi.mock('./codeSurfaceApi.js', async () => {
  const actual = await vi.importActual<typeof import('./codeSurfaceApi.js')>('./codeSurfaceApi.js');
  return {
    ...actual,
    fetchCodeSurfaceSources: vi.fn(),
    stageCodeSurfaceFile: vi.fn(),
    patchCodeSurfaceFile: vi.fn(),
    discardCodeSurfaceEdits: vi.fn(),
    deliverCodeSurface: vi.fn(),
  };
});

const mocked = vi.mocked(codeSurfaceApi);

type RegisteredTool = {
  name: string;
  description: string;
  execute: (input: Record<string, unknown>) => Promise<string>;
};

function installFakeModelContext() {
  const registered: RegisteredTool[] = [];
  const signals: AbortSignal[] = [];
  const registerTool = vi.fn(async (tool: RegisteredTool, options?: { signal?: AbortSignal }) => {
    registered.push(tool);
    if (options?.signal) signals.push(options.signal);
  });
  (document as unknown as { modelContext?: unknown }).modelContext = { registerTool };
  return { registered, signals, registerTool };
}

function removeFakeModelContext() {
  delete (document as unknown as { modelContext?: unknown }).modelContext;
  delete (globalThis.navigator as unknown as { modelContext?: unknown }).modelContext;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

let webmcp: typeof import('./webmcp.js');

beforeEach(async () => {
  vi.resetModules();
  window.localStorage.clear();
  webmcp = await import('./webmcp.js');
});

afterEach(() => {
  removeFakeModelContext();
  vi.clearAllMocks();
});

describe('registerCodeSurfaceWebMcpTools', () => {
  it('is a no-op when the browser has no modelContext', () => {
    removeFakeModelContext();
    const cleanup = webmcp.registerCodeSurfaceWebMcpTools('astro-tanks');
    expect(() => cleanup()).not.toThrow();
  });

  it('registers a tool set matching the BYOCA MCP contract names, all under a shared abortable signal', async () => {
    const { registered, signals, registerTool } = installFakeModelContext();
    const cleanup = webmcp.registerCodeSurfaceWebMcpTools('astro-tanks');
    await flush();

    const names = registered.map((tool) => tool.name);
    expect(names).toEqual([
      'get_sources',
      'stage_source_file',
      'patch_source_file',
      'clear_staged_sources',
      'submit_sources',
      'studio_get_agent_guide',
    ]);
    expect(registerTool).toHaveBeenCalledTimes(6);

    // One shared controller — cleanup aborts every registration's signal at once.
    expect(signals.length).toBe(6);
    expect(signals.every((signal) => signal === signals[0])).toBe(true);
    expect(signals[0]!.aborted).toBe(false);
    cleanup();
    expect(signals[0]!.aborted).toBe(true);
  });

  it('get_sources returns every file with its working-copy content', async () => {
    const { registered } = installFakeModelContext();
    mocked.fetchCodeSurfaceSources.mockResolvedValue({
      slug: 'astro-tanks',
      version: '1',
      files: [{ path: 'game.ts', content: 'export {}', stagedBy: 'owner' }],
      deleted: [],
      readOnly: false,
      staged: { totalBytes: 0, maxBytes: 1, maxFiles: 1, updatedAt: null },
    });
    webmcp.registerCodeSurfaceWebMcpTools('astro-tanks');
    await flush();

    const tool = registered.find((entry) => entry.name === 'get_sources')!;
    const result = JSON.parse(await tool.execute({}));
    expect(result).toEqual({ available: true, files: [{ path: 'game.ts', content: 'export {}' }] });
  });

  it('patch_source_file forwards old/new edits and reports the replacement count', async () => {
    const { registered } = installFakeModelContext();
    mocked.patchCodeSurfaceFile.mockResolvedValue({
      accepted: true,
      path: 'game.ts',
      bytes: 10,
      staged: { totalBytes: 10, maxBytes: 100, maxFiles: 10, updatedAt: null },
      replacements: 1,
      baseFrom: 'delivery',
    });
    webmcp.registerCodeSurfaceWebMcpTools('astro-tanks');
    await flush();

    const tool = registered.find((entry) => entry.name === 'patch_source_file')!;
    const result = JSON.parse(await tool.execute({ path: 'game.ts', old: 'foo', new: 'bar' }));
    expect(mocked.patchCodeSurfaceFile).toHaveBeenCalledWith('astro-tanks', 'game.ts', { old: 'foo', new: 'bar' });
    expect(result).toEqual({ ok: true, path: 'game.ts', bytes: 10, replacements: 1 });
  });

  it('submit_sources only ever delivers mode "preview"', async () => {
    const { registered } = installFakeModelContext();
    mocked.deliverCodeSurface.mockResolvedValue({
      accepted: true,
      slug: 'astro-tanks',
      version: '2',
      mode: 'preview',
      gateStarted: true,
    });
    webmcp.registerCodeSurfaceWebMcpTools('astro-tanks');
    await flush();

    const tool = registered.find((entry) => entry.name === 'submit_sources')!;
    await tool.execute({});
    expect(mocked.deliverCodeSurface).toHaveBeenCalledWith('astro-tanks', 'preview');
  });

  it('a tool call notifies agent-activity subscribers', async () => {
    const { registered } = installFakeModelContext();
    mocked.fetchCodeSurfaceSources.mockResolvedValue({
      slug: 'astro-tanks',
      version: null,
      files: [],
      deleted: [],
      readOnly: false,
      staged: { totalBytes: 0, maxBytes: 1, maxFiles: 1, updatedAt: null },
    });
    const events: string[] = [];
    const unsubscribe = webmcp.subscribeAgentActivity((event) => events.push(event.tool));
    webmcp.registerCodeSurfaceWebMcpTools('astro-tanks');
    await flush();

    const tool = registered.find((entry) => entry.name === 'get_sources')!;
    await tool.execute({});
    expect(events).toEqual(['get_sources']);
    unsubscribe();
  });
});

describe('agent-mode opt-in storage', () => {
  it('defaults to disabled and round-trips through localStorage', () => {
    expect(webmcp.isAgentModeEnabled('astro-tanks')).toBe(false);
    webmcp.setAgentModeEnabled('astro-tanks', true);
    expect(webmcp.isAgentModeEnabled('astro-tanks')).toBe(true);
    webmcp.setAgentModeEnabled('astro-tanks', false);
    expect(webmcp.isAgentModeEnabled('astro-tanks')).toBe(false);
  });

  it('scopes the opt-in per game slug', () => {
    webmcp.setAgentModeEnabled('astro-tanks', true);
    expect(webmcp.isAgentModeEnabled('other-game')).toBe(false);
  });
});
