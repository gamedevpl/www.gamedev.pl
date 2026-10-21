import { describe, expect, it, vi } from 'vitest';
import type { BuildBrief } from './agent-backend.js';
import { buildPrompt } from './build-prompt.js';
import type { ManagedAgentProvider, ManagedSessionRequest } from './managed-agent.js';
import { startWithWorkspace, workspaceKickoff } from './managed-workspace.js';
import { InMemoryStore } from '../platform/store.js';
import { loadReferenceArchives } from './workspace-references.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64');

async function withReference() {
  const store = new InMemoryStore();
  await store.createSubmission(4, 'g:owner', 'Racer');
  const shot = await store.appendBuildShot(4, { data: PNG, label: 'creator-reference' });
  return { store, shot };
}

describe('mounted reference images', () => {
  it('mounts a first build’s reference images and marks them seen once mounted', async () => {
    const { store, shot } = await withReference();
    const refs = await loadReferenceArchives(store, (await store.getSubmission(4))!);
    expect(refs.archives.map((ref) => [ref.name, ref.type])).toEqual([['reference-1.png', 'image/png']]);
    expect(Buffer.from(refs.archives[0]!.bytes).toString('base64')).toBe(PNG);
    await refs.markSeen();
    const [stored] = await store.listBuildShots(4, { label: 'creator-reference' });
    expect(stored?.id).toBe(shot.id);
    expect((await store.getBuildShot(4, shot.id))?.agentSeenAt).toBeTruthy();
  });

  it('mounts nothing on a later round unless a pending note names the image', async () => {
    const { store } = await withReference();
    const record = { ...(await store.getSubmission(4))!, previewVersion: 'v1' };
    expect((await loadReferenceArchives(store, record)).archives).toEqual([]);
  });

  it('names the mounted paths in the kickoff and marks them after the session starts', async () => {
    const onMounted = vi.fn(async () => {});
    const workspace = {
      engineRef: 'eng',
      references: ['reference-1.png'],
      onMounted,
      archives: [{ name: 'kit.tgz', bytes: new Uint8Array([1]) }],
    };
    const lines = workspaceKickoff('/mnt/session/uploads', workspace).join('\n');
    expect(lines).toContain('`/mnt/session/uploads/reference-1.png`');
    expect(lines).toContain('No `get_reference_images` call is needed');
    const prompt = buildPrompt({ jobId: 4, slug: 'r', spec: 's', channelToken: 't', apiBaseUrl: 'x' } as BuildBrief, {
      shell: true,
      workspace: [lines],
      mountedReferences: true,
    });
    expect(prompt).toContain('`read` the mounted ones above');
    const startSession = vi.fn(async () => ({ id: 's', state: 'queued' as const }));
    const provider = { startSession, workspaceArchiveDir: '/mnt/session/uploads' } as unknown as ManagedAgentProvider;
    await startWithWorkspace(
      provider,
      async () => workspace,
      { prompt: 'p' } as ManagedSessionRequest,
      () => 'ws',
    );
    expect(onMounted).toHaveBeenCalledTimes(1);
  });
});
