import { describe, expect, it } from 'vitest';
import { handleHelperLine, refuseNonFastForward } from './git-remote.js';
import { unreconciledMessage } from './checkout.js';

describe('git-remote-gamedev', () => {
  it('advertises fetch and push and refuses non-ff like gamedev diff', () => {
    expect(handleHelperLine('capabilities', 'ghost-roads')).toContain('fetch');
    expect(handleHelperLine('capabilities', 'ghost-roads')).toContain('push');
    expect(refuseNonFastForward()).toContain(unreconciledMessage().slice(0, 20));
  });
});
