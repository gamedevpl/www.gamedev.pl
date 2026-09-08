import { createHmac, timingSafeEqual } from 'node:crypto';

// The verdict a lane may record; progress is open to all.
export type GateVerdictKind = 'gate' | 'preview' | 'health';

// One version and one lane per capability.
export interface GateVerdictClaims {
  slug: string;
  version: string;
  kind: GateVerdictKind;
  exp: number;
}

export class InvalidGateVerdictTokenError extends Error {
  constructor(message = 'invalid gate verdict token') {
    super(message);
    this.name = 'InvalidGateVerdictTokenError';
  }
}

// Outlives a queued build, not much else.
export const GATE_VERDICT_TOKEN_TTL_SECONDS = 6 * 60 * 60;

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function mintGateVerdictToken(
  slug: string,
  version: string,
  secret: string,
  kind: GateVerdictKind = 'gate',
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const claims: GateVerdictClaims = { slug, version, kind, exp: nowSeconds + GATE_VERDICT_TOKEN_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function readGateVerdictToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): GateVerdictClaims {
  const parts = token.split('.');
  if (parts.length !== 2) throw new InvalidGateVerdictTokenError('malformed');
  const [payload, signature] = parts;
  if (!payload || !signature) throw new InvalidGateVerdictTokenError('malformed');

  const expected = sign(payload, secret);
  const got = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    throw new InvalidGateVerdictTokenError('bad signature');
  }

  let claims: GateVerdictClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GateVerdictClaims;
  } catch {
    throw new InvalidGateVerdictTokenError('unreadable claims');
  }
  if (typeof claims.slug !== 'string' || !claims.slug) throw new InvalidGateVerdictTokenError('no slug');
  if (typeof claims.version !== 'string' || !claims.version) throw new InvalidGateVerdictTokenError('no version');
  if (claims.kind !== 'gate' && claims.kind !== 'preview' && claims.kind !== 'health') {
    throw new InvalidGateVerdictTokenError('no lane');
  }
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) throw new InvalidGateVerdictTokenError('expired');
  return claims;
}
