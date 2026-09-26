import { capabilityPayload } from '../platform/capability-revision.js';
import { decodeActorUidField } from '../platform/actor-uid.js';
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

// Shape classification is not authorization.
export function looksLikeMcpSessionKey(candidate: string): boolean {
  if (candidate.startsWith('mcp2_')) return /^mcp2_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(candidate);
  const parts = Buffer.from(capabilityPayload(candidate), 'base64url').toString('utf8').split('.');
  if (parts.length !== 5 && parts.length !== 6) return false;
  const sessionId = parts[0];
  const jobIdRaw = parts[1];
  const generationRaw = parts[2];
  const expRaw = parts[3];
  const actorOrSig = parts[4];
  const signature = parts.length === 6 ? parts[5] : actorOrSig;
  const actorOk = parts.length === 5 || decodeActorUidField(actorOrSig ?? '') !== undefined;
  return (
    Boolean(sessionId) &&
    SESSION_ID_RE.test(sessionId) &&
    /^\d+$/.test(jobIdRaw ?? '') &&
    /^\d+$/.test(generationRaw ?? '') &&
    /^\d+$/.test(expRaw ?? '') &&
    actorOk &&
    /^[a-f0-9]{64}$/i.test(signature ?? '')
  );
}
