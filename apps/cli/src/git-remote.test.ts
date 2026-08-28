import { describe, expect, it } from 'vitest';
import { fastImportScript, handleHelperLine, listRefs, refuseNonFastForward, shaForVersion } from './git-remote.js';
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
    expect(listed[0]).toContain(shaForVersion('v-2'));
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
});
