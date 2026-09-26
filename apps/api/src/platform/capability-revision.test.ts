import { describe, expect, it } from 'vitest';
import { mintAgentToken, verifyAgentToken } from './agent-token.js';
import { mintUploadToken, verifyUploadToken } from '../agent-surface/agent-upload-token.js';

const secret = 'membership-test-secret';
describe('signed membership revisions', () => {
  const options = { jobId: 1, roundGeneration: 1, actorUid: 'a:with.dots', actorRevision: 5 };
  const cases = [
    ['agent', () => mintAgentToken(1, secret, options), verifyAgentToken],
    ['upload', () => mintUploadToken(secret, { ...options, kind: 'screenshot' }), verifyUploadToken],
  ] as const;
  for (const [name, mint, verify] of cases)
    it(`${name} refuses a forged newer membership revision`, () => {
      const token = mint();
      expect(verify(token, secret)).toMatchObject({ actorUid: options.actorUid, actorRevision: 5 });
      const envelope = JSON.parse(Buffer.from(token.slice('member1_'.length), 'base64url').toString('utf8'));
      envelope[0] = 6;
      const forged = 'member1_' + Buffer.from(JSON.stringify(envelope)).toString('base64url');
      expect(() => verify(forged, secret)).toThrow();
    });
});
