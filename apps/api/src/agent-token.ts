import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Build-channel tokens (docs/agent-live-channel-plan.md §1).
 *
 * The coding agent needs to authenticate to our API from inside GitHub's sandbox.
 * Rather than distributing a shared secret into that environment, each build gets
 * its own capability token, minted from the issue number and handed to the agent in
 * the issue body it was assigned.
 *
 * It is deliberately scoped: the HMAC covers a scope string, so a build token and a
 * submission token for the same issue are different values even though both are keyed
 * off SUBMISSION_TOKEN_SECRET. One can never be forged from — or mistaken for — the
 * other, which matters because the submission token can spend quota and stop a build
 * while this one may only talk about it.
 */

export class InvalidAgentTokenError extends Error {
  constructor(message = 'invalid build token') {
    super(message);
    this.name = 'InvalidAgentTokenError';
  }
}

const SCOPE = 'agent-channel-v1';

function signIssueNumber(issueNumber: number, secret: string): string {
  return createHmac('sha256', secret).update(`${SCOPE}:${issueNumber}`).digest('hex');
}

export function mintAgentToken(issueNumber: number, secret: string): string {
  return Buffer.from(`${issueNumber}.${signIssueNumber(issueNumber, secret)}`, 'utf8').toString('base64url');
}

export function verifyAgentToken(token: string, secret: string): number {
  try {
    const parts = Buffer.from(token, 'base64url').toString('utf8').split('.');
    if (parts.length !== 2) {
      throw new InvalidAgentTokenError();
    }

    const [issueNumberRaw, signature] = parts;
    if (!issueNumberRaw || !signature || !/^\d+$/.test(issueNumberRaw) || !/^[a-f0-9]{64}$/i.test(signature)) {
      throw new InvalidAgentTokenError();
    }

    const issueNumber = Number.parseInt(issueNumberRaw, 10);
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
      throw new InvalidAgentTokenError();
    }

    const expected = signIssueNumber(issueNumber, secret);
    const actualBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new InvalidAgentTokenError();
    }

    return issueNumber;
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      throw error;
    }
    throw new InvalidAgentTokenError();
  }
}

/**
 * Pulls the token out of `Authorization: Bearer …`. The agent channel takes its
 * credential from a header rather than the path (unlike the creator-facing status
 * routes) because these calls come from scripts and CI-ish environments where URLs
 * end up in shell history and access logs.
 */
export function readBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
