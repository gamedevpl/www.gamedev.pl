import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'member1_';

// Bind a membership revision without changing the legacy capability payload.
export function bindCapabilityRevision(token: string, revision: number | undefined, secret: string): string {
  if (revision === undefined) return token;
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('invalid capability revision');
  const signature = createHmac('sha256', secret).update(`${PREFIX}${revision}:${token}`).digest('hex');
  return PREFIX + Buffer.from(JSON.stringify([revision, token, signature])).toString('base64url');
}

// Shape classification only; authorization must verify the envelope and inner token.
export function capabilityPayload(token: string): string {
  if (!token.startsWith(PREFIX)) return token;
  try {
    const value = JSON.parse(Buffer.from(token.slice(PREFIX.length), 'base64url').toString('utf8'));
    return Array.isArray(value) && typeof value[1] === 'string' ? value[1] : '';
  } catch {
    return '';
  }
}

export function verifyCapabilityRevision(token: string, secret: string): { token: string; actorRevision?: number } {
  if (!token.startsWith(PREFIX)) return { token };
  const value: unknown = JSON.parse(Buffer.from(token.slice(PREFIX.length), 'base64url').toString('utf8'));
  if (!Array.isArray(value) || value.length !== 3) throw new Error('invalid capability envelope');
  const [revision, payload, signature] = value as unknown[];
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    typeof payload !== 'string' ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    throw new Error('invalid capability envelope');
  }
  const expected = createHmac('sha256', secret).update(`${PREFIX}${revision}:${payload}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new Error('invalid capability signature');
  return { token: payload, actorRevision: revision };
}
