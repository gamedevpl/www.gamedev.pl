import { verifyAgentToken } from '../platform/agent-token.js';
import { looksLikeMcpSessionKey, verifyMcpSessionKey } from './mcp-session-key.js';

// Presence uses a verified session key or round bearer.
export function resolvePresenceJobId(sessionKey: string, bearer: string | null, secret: string): number | null {
  if (sessionKey && looksLikeMcpSessionKey(sessionKey)) {
    try {
      return verifyMcpSessionKey(sessionKey, secret).jobId;
    } catch {
      return null;
    }
  }
  if (bearer) {
    try {
      return verifyAgentToken(bearer, secret).jobId;
    } catch {
      return null;
    }
  }
  return null;
}
