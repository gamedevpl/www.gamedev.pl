import { describe, expect, it } from 'vitest';
import { fastImportScript, handleHelperLine, listRefs, refuseNonFastForward, shaForVersion } from './git-remote.js';
import { remoteSlugFromArgv } from './git-remote-main.js';
import { unreconciledMessage } from './checkout.js';

describe('git-remote-gamedev', () => {
  it('advertises import and push and refuses non-ff like gamedev diff', () => {
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

  it('resolves no slug when the remote URL and checkout file are missing', () => {
    expect(remoteSlugFromArgv(['node', 'git-remote-gamedev'], null)).toBe('');
    expect(remoteSlugFromArgv(['node', 'git-remote-gamedev'], 'ghost-roads')).toBe('ghost-roads');
    expect(remoteSlugFromArgv(['node', 'git-remote-gamedev', 'origin', 'gamedev://ghost-roads'], null)).toBe(
      'ghost-roads',
    );
  });
});
