import { describe, expect, it } from 'vitest';
import {
  fastImportScript,
  handleHelperLine,
  listRefs,
  refuseNonFastForward,
  runRemoteHelper,
  shaForVersion,
} from './git-remote.js';
import { remoteSlugFromArgv } from './git-remote-main.js';
import { unreconciledMessage } from './checkout.js';

describe('git-remote-gamedevpl', () => {
  it('advertises import and push and refuses non-ff like gamedevpl diff', () => {
    expect(handleHelperLine('capabilities', 'ghost-roads')).toContain('import');
    expect(handleHelperLine('capabilities', 'ghost-roads')).toContain('push');
    expect(refuseNonFastForward()).toContain(unreconciledMessage().slice(0, 20));
  });

  it('lists one commit per version and encodes a fast-import stream', () => {
    const versions = [
      { version: 'v-2', createdAt: '2026-08-02T00:00:00.000Z' },
      { version: 'v-1', createdAt: '2026-08-01T00:00:00.000Z' },
    ];
    const listed = listRefs(versions);
    expect(listed).toContain('@refs/heads/main HEAD');
    expect(listed).toContain('? refs/heads/main');
    expect(listed.some((line) => line.includes(shaForVersion('v-2')))).toBe(false);
    const script = fastImportScript({
      slug: 'ghost-roads',
      versions,
      trees: new Map([
        ['v-1', [{ path: 'game.ts', content: 'a' }]],
        ['v-2', [{ path: 'game.ts', content: 'b' }]],
      ]),
    });
    expect(script).toContain('commit refs/heads/main');
    expect(script).toContain('games/ghost-roads/game.ts');
    expect(script.match(/mark :\d+/g)?.length).toBe(2);
  });

  it('lists an unborn main ref when the remote has no versions', () => {
    expect(listRefs([])).toEqual(['@refs/heads/main HEAD', '? refs/heads/main', '']);
  });

  it('marks a successful push as delivered, not as a fake helper ok', async () => {
    const written: string[] = [];
    const lines = ['push refs/heads/main:refs/heads/main', ''];
    await runRemoteHelper('ghost-roads', {
      readLine: async () => lines.shift() ?? null,
      write: (line) => written.push(line),
      fetchVersions: async () => [],
      fetchTree: async () => [],
      importScript: async () => undefined,
      pushReconcile: async () => ({ ok: true }),
    });
    expect(written.join('')).toContain('ok refs/heads/main');
    expect(written.join('')).not.toMatch(/not a delivery path/);
  });

  it('resolves no slug when the remote URL and checkout file are missing', () => {
    expect(remoteSlugFromArgv(['node', 'git-remote-gamedevpl'], null)).toBe('');
    expect(remoteSlugFromArgv(['node', 'git-remote-gamedevpl'], 'ghost-roads')).toBe('ghost-roads');
    expect(remoteSlugFromArgv(['node', 'git-remote-gamedevpl', 'origin', 'gamedevpl://ghost-roads'], null)).toBe(
      'ghost-roads',
    );
  });
});
