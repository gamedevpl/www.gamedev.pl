// Signed one-click email-unsubscribe tokens (docs/notifications-plan.md). A token
// embeds a uid and is HMAC-signed so the unsubscribe link works from a mail client
// on a device that has never signed in — no session required. The `unsub:` domain
// prefix keeps these structurally distinct from session tokens even when they share
// a secret, so one can never be replayed as the other.

import { createHmac, timingSafeEqual } from 'node:crypto';

export class InvalidUnsubscribeTokenError extends Error {
  constructor(message = 'invalid unsubscribe token') {
    super(message);
    this.name = 'InvalidUnsubscribeTokenError';
  }
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsub:${payloadB64}`).digest('base64url');
}

export function mintUnsubscribeToken(uid: string, secret: string): string {
  const payload = Buffer.from(uid, 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): string {
  const parts = token.split('.');
  if (parts.length !== 2) throw new InvalidUnsubscribeTokenError();
  const [payload, signature] = parts;
  if (!payload || !signature) throw new InvalidUnsubscribeTokenError();

  const expected = sign(payload, secret);
  const actualBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new InvalidUnsubscribeTokenError();
  }

  const uid = Buffer.from(payload, 'base64url').toString('utf8');
  if (!uid) throw new InvalidUnsubscribeTokenError();
  return uid;
}
