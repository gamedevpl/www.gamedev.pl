import { createHmac, timingSafeEqual } from 'node:crypto';

export type UnsubscribeScope = 'all' | 'digest';

export class InvalidUnsubscribeTokenError extends Error {
  constructor(message = 'invalid unsubscribe token') {
    super(message);
    this.name = 'InvalidUnsubscribeTokenError';
  }
}

function sign(payloadB64: string, secret: string, scope?: UnsubscribeScope): string {
  const signedValue = scope ? `unsub:${scope}:${payloadB64}` : `unsub:${payloadB64}`;
  return createHmac('sha256', secret).update(signedValue).digest('base64url');
}

export function mintUnsubscribeToken(uid: string, secret: string, scope: UnsubscribeScope = 'all'): string {
  const payload = Buffer.from(uid, 'utf8').toString('base64url');
  if (scope === 'digest') return `${payload}.${scope}.${sign(payload, secret, scope)}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  requestedScope: UnsubscribeScope = 'all',
): string {
  const parts = token.split('.');
  if (parts.length !== 2 && parts.length !== 3) throw new InvalidUnsubscribeTokenError();
  const [payload, tokenScope, signature] =
    parts.length === 2 ? [parts[0], 'all' satisfies UnsubscribeScope, parts[1]] : parts;
  if (!payload || !signature) throw new InvalidUnsubscribeTokenError();
  if (tokenScope !== 'all' && tokenScope !== 'digest') throw new InvalidUnsubscribeTokenError();
  if (tokenScope === 'digest' && requestedScope !== 'digest') throw new InvalidUnsubscribeTokenError();

  const expected = sign(payload, secret, tokenScope === 'all' ? undefined : tokenScope);
  const actualBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new InvalidUnsubscribeTokenError();
  }

  const uid = Buffer.from(payload, 'base64url').toString('utf8');
  if (!uid) throw new InvalidUnsubscribeTokenError();
  return uid;
}
