import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { BuildBrief } from './agent-backend.js';
import { buildPrompt } from './build-prompt.js';
import type { ManagedAgentProvider, ManagedSessionRequest } from './managed-agent.js';
import {
  createManagedWorkspaceLoader,
  ManagedWorkspaceError,
  startWithWorkspace,
  workspaceKickoff,
  type ManagedWorkspace,
  type ManagedWorkspaceDeps,
} from './managed-workspace.js';

const BRIEF = { jobId: 9, slug: 'rocks', spec: 's', channelToken: 't', apiBaseUrl: 'https://x' } as BuildBrief;

const pin = vi.fn(async (_jobId: number, ref: string) => ref);

function deps(record: object | null, objects: Record<string, string>): ManagedWorkspaceDeps {
  return {
    store: { getSubmission: async () => record, pinRoundKitEngineRef: pin } as unknown as ManagedWorkspaceDeps['store'],
    gamesStore: {
      getManifest: async () => ({ sourceFiles: ['game.ts', 'GAME.json'] }),
      getSourceFile: async (_slug: string, _version: string, path: string) => `// ${path}`,
    } as unknown as ManagedWorkspaceDeps['gamesStore'],
    objectStore: {
      readObject: async (name: string) => (name in objects ? Buffer.from(objects[name]!) : null),
    },
    log: { error: vi.fn() } as unknown as ManagedWorkspaceDeps['log'],
  };
}

const KITS = {
  'kits/current.json': JSON.stringify({ current: 'eng_new', previous: null, updatedAt: '2026-10-12T00:00:00Z' }),
  'kits/eng_new.tgz': 'NEW',
};

describe('managed workspace loader', () => {
  it('mounts the current kit and the round base sources under the slug', async () => {
    const load = createManagedWorkspaceLoader(deps({ slug: 'rocks', previewVersion: 'v3' }, KITS));
    const workspace = await load(BRIEF);
    expect(workspace?.engineRef).toBe('eng_new');
    expect(pin).toHaveBeenCalledWith(9, 'eng_new', false);
    pin.mockRejectedValueOnce(new Error('contention'));
    await expect(load(BRIEF)).rejects.toThrow('contention');
    pin.mockResolvedValueOnce('eng_other');
    await expect(load(BRIEF)).rejects.toThrow('round pinned eng_other');
    expect(workspace?.slug).toBe('rocks');
    expect(workspace?.delivered).toBe(true);
    expect(workspace?.archives.map((archive) => archive.name)).toEqual(['kit.tgz', 'sources.tgz']);
    expect(Buffer.from(workspace!.archives[0]!.bytes).toString()).toBe('NEW');
    expect(gunzipSync(workspace!.archives[1]!.bytes).toString('latin1')).toContain('rocks/game.ts');
  });

  it('keeps the round pin get_kit would report while its kit is still stored', async () => {
    const objects = { ...KITS, 'kits/eng_old.tgz': 'OLD' };
    const load = createManagedWorkspaceLoader(
      deps({ slug: 'rocks', previewVersion: 'v1', roundKitEngineRef: 'eng_old' }, objects),
    );
    const workspace = await load(BRIEF);
    expect(workspace?.engineRef).toBe('eng_old');
    expect(Buffer.from(workspace!.archives[0]!.bytes).toString()).toBe('OLD');
  });

  it('drops the pin after a kit_outdated verdict, as get_kit does', async () => {
    const objects = { ...KITS, 'kits/eng_old.tgz': 'OLD' };
    const base = deps({ slug: 'rocks', previewVersion: 'v1', roundKitEngineRef: 'eng_old' }, objects);
    const gamesStore = {
      ...base.gamesStore,
      getManifest: async () => ({
        sourceFiles: ['game.ts'],
        gate: { green: false, ranAt: 't', status: 'kit_outdated' },
      }),
    } as unknown as ManagedWorkspaceDeps['gamesStore'];
    const workspace = await createManagedWorkspaceLoader({ ...base, gamesStore })(BRIEF);
    expect(workspace?.engineRef).toBe('eng_new');
    expect(Buffer.from(workspace!.archives[0]!.bytes).toString()).toBe('NEW');
    expect(pin).toHaveBeenLastCalledWith(9, 'eng_new', true);
    expect(workspace?.kitOutdated).toBe(true);
    expect(workspaceKickoff('/mnt', workspace!).join('\n')).toMatch(
      /call `get_kit` once\. If its kitEngineRef is not eng_new, move `games\/` aside.*Submit with get_kit's kitEngineRef/,
    );
  });

  it('mounts nothing when the kit is not published', async () => {
    expect(await createManagedWorkspaceLoader(deps({ slug: 'rocks' }, {}))(BRIEF)).toBeNull();
  });
});

describe('workspace kickoff', () => {
  it('names the mounted archives and one unpack command', () => {
    const lines = workspaceKickoff('/mnt/session/uploads', {
      engineRef: 'eng_new',
      slug: 'rocks',
      archives: [],
    }).join('\n');
    expect(lines).toContain('tar xzf /mnt/session/uploads/kit.tgz -C /workspace');
    expect(lines).toContain('tar xzf /mnt/session/uploads/sources.tgz -C /workspace/gamedevpl-creator-kit/games');
    expect(lines).toContain('npm config set update-notifier false && mkdir -p /workspace');
    expect(lines).toContain('npm ci --ignore-scripts');
    expect(lines).toContain('`games/rocks/`');
    expect(lines).not.toContain('do not call `get_sources`');
    expect(lines).toContain('Submit with kitEngineRef eng_new');
    expect(lines).toMatch(/delete the kit directory.*npm ci --ignore-scripts` again/);
  });

  it('replaces the download steps in the shell kickoff', () => {
    const workspace = workspaceKickoff('/mnt/session/uploads', { engineRef: 'e', slug: 'rocks', archives: [] });
    const prompt = buildPrompt(BRIEF, { shell: true, workspace });
    expect(prompt).toContain('Your workspace is already mounted');
    expect(prompt).not.toContain('GET its `archive` once');
    expect(prompt).not.toContain('Unpack `get_kit`’s kitUrl once');
    expect(buildPrompt(BRIEF, { shell: true })).toContain('Unpack `get_kit`’s kitUrl once');
  });

  it('drops the get_sources steps when the game’s files are mounted', () => {
    const workspace = workspaceKickoff('/mnt/session/uploads', {
      engineRef: 'e',
      slug: 'rocks',
      delivered: true,
      archives: [],
    });
    const brief = { ...BRIEF, undelivered: true, previewVersion: 'v3', feedback: 'faster' } as BuildBrief;
    const prompt = buildPrompt(brief, { shell: true, workspace, mountedSources: true });
    expect(prompt).toContain('start from the files already in `games/rocks/`');
    expect(prompt).toContain('do not call `get_sources`');
    expect(prompt).toContain('2. `get_brief`, `read_inbox` and `creator_notes` (sessionKey only).');
    expect(prompt).toContain('no `get_kit` call is needed');
    expect(prompt).not.toContain('Call `get_sources` before deciding anything');
    expect(buildPrompt(brief, { shell: true, workspace })).toContain('Call `get_sources` before deciding anything');
  });
});

describe('startWithWorkspace', () => {
  const REQUEST: ManagedSessionRequest = { correlationId: '9', prompt: 'plain', model: 'm' };
  const WORKSPACE: ManagedWorkspace = { engineRef: 'e', archives: [{ name: 'kit.tgz', bytes: new Uint8Array() }] };

  it('never loads a workspace for a vendor that cannot mount one', async () => {
    const startSession = vi.fn(async () => ({ id: 's', state: 'queued' as const }));
    const load = vi.fn(async () => WORKSPACE);
    await startWithWorkspace({ startSession } as unknown as ManagedAgentProvider, load, REQUEST, () => 'ws');
    expect(load).not.toHaveBeenCalled();
    expect(startSession).toHaveBeenCalledWith(REQUEST);
  });

  it('mounts the archives with the workspace kickoff', async () => {
    const startSession = vi.fn(async () => ({ id: 's', state: 'queued' as const }));
    const provider = { startSession, workspaceArchiveDir: '/mnt/session/uploads' } as unknown as ManagedAgentProvider;
    const promptWith = vi.fn(() => 'ws');
    await startWithWorkspace(
      provider,
      async () => ({ ...WORKSPACE, slug: 'rocks', delivered: true }),
      REQUEST,
      promptWith,
    );
    expect(promptWith).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ delivered: true }));
    expect(startSession).toHaveBeenCalledWith({ ...REQUEST, prompt: 'ws', workspaceArchives: WORKSPACE.archives });
  });

  it('starts the plain round when the upload is refused or the workspace cannot be read', async () => {
    const startSession = vi
      .fn()
      .mockRejectedValueOnce(new ManagedWorkspaceError('upload failed'))
      .mockResolvedValue({ id: 's', state: 'queued' });
    const provider = { startSession, workspaceArchiveDir: '/mnt/session/uploads' } as unknown as ManagedAgentProvider;
    await startWithWorkspace(
      provider,
      async () => WORKSPACE,
      REQUEST,
      () => 'ws',
    );
    expect(startSession).toHaveBeenLastCalledWith(REQUEST);

    startSession.mockClear();
    await startWithWorkspace(
      provider,
      async () => Promise.reject(new Error('gcs down')),
      REQUEST,
      () => 'ws',
    );
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalledWith(REQUEST);
  });

  it('does not retry a session the vendor refused for another reason', async () => {
    const startSession = vi.fn().mockRejectedValue(new Error('quota'));
    const provider = { startSession, workspaceArchiveDir: '/mnt/session/uploads' } as unknown as ManagedAgentProvider;
    await expect(
      startWithWorkspace(
        provider,
        async () => WORKSPACE,
        REQUEST,
        () => 'ws',
      ),
    ).rejects.toThrow('quota');
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('starts the plain round when the workspace read stalls', async () => {
    const startSession = vi.fn(async () => ({ id: 's', state: 'queued' as const }));
    const provider = { startSession, workspaceArchiveDir: '/mnt/session/uploads' } as unknown as ManagedAgentProvider;
    const stalled = () => new Promise<ManagedWorkspace | null>(() => {});
    await startWithWorkspace(provider, stalled, REQUEST, () => 'ws', undefined, 10);
    expect(startSession).toHaveBeenCalledWith(REQUEST);
  });
});
