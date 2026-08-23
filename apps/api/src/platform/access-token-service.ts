import {
  generateAccessToken,
  isAccessTokenExpired,
  looksLikeAccessToken,
  parseAccessToken,
  verifyTokenSecret,
} from './access-token.js';
import { BOT_UID_PREFIX, type AccessTokenRecord, type Store, type User } from './store.js';

export { isAccessTokenExpired } from './access-token.js';

/**
 * The rules for issuing a personal access token, in one place
 * (docs/agent-access-tokens.md).
 *
 * There are two ways to mint one — the operator HTTP route and the `token:mint` CLI —
 * and they must agree about the namespace rule, the cap and the expiry default. Anything
 * duplicated across those two paths would eventually drift, and the drift would be silent
 * and security-relevant, so the route and the script are both thin wrappers over this.
 */

export const MAX_TOKENS_PER_UID = 10;
export const DEFAULT_EXPIRY_DAYS = 90;
export const MAX_EXPIRY_DAYS = 365;

export type MintFailureReason = 'unknown_uid' | 'blocked' | 'too_many_tokens' | 'invalid_expiry';

export class MintAccessTokenError extends Error {
  constructor(
    readonly reason: MintFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'MintAccessTokenError';
  }
}

export interface MintAccessTokenParams {
  uid: string;
  name: string;
  createdByUid: string;
  expiresInDays?: number;
  nowMs?: number;
}

export interface MintAccessTokenResult {
  /** The credential itself. Readable exactly once — nothing persists it. */
  token: string;
  record: AccessTokenRecord;
  /** True when this mint called the account into existence. */
  accountCreated: boolean;
}

export async function mintAccessTokenFor(store: Store, params: MintAccessTokenParams): Promise<MintAccessTokenResult> {
  const { uid, name, createdByUid } = params;
  const nowMs = params.nowMs ?? Date.now();
  const expiresInDays = params.expiresInDays ?? DEFAULT_EXPIRY_DAYS;

  // Enforced here (not only at the HTTP boundary) so the CLI cannot mint a
  // token that outlives the documented max, or a zero/negative window.
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > MAX_EXPIRY_DAYS) {
    throw new MintAccessTokenError('invalid_expiry', `expiresInDays must be an integer from 1 to ${MAX_EXPIRY_DAYS}`);
  }

  const existing = await store.getUser(uid);

  // The namespace rule is a typo guard with teeth: without it a mistyped `g:<sub>` would
  // silently call an account into being — one that never signed in, never passed the beta
  // allowlist, and now holds a working credential.
  if (!existing && !uid.startsWith(BOT_UID_PREFIX)) {
    throw new MintAccessTokenError(
      'unknown_uid',
      `unknown uid — a token for a new account requires the "${BOT_UID_PREFIX}" namespace`,
    );
  }

  if (existing?.tier === 'blocked') {
    throw new MintAccessTokenError('blocked', 'account is blocked');
  }

  const held = await store.listAccessTokens(uid);
  if (held.length >= MAX_TOKENS_PER_UID) {
    throw new MintAccessTokenError(
      'too_many_tokens',
      `uid already holds ${MAX_TOKENS_PER_UID} tokens — revoke one first`,
    );
  }

  // Creating the account here is the intended operator power, and the reason the uid rule
  // above is strict. A `bot:` account is an ordinary user from this point on: standard
  // tier, the same daily quota, the same walls.
  const user = existing ?? (await store.upsertUser({ uid, name: `Bot ${uid.slice(BOT_UID_PREFIX.length)}` }));

  const { token, tokenId, secretHash } = generateAccessToken();
  const record: AccessTokenRecord = {
    tokenId,
    uid: user.uid,
    secretHash,
    name,
    createdAt: new Date(nowMs).toISOString(),
    createdByUid,
    expiresAt: new Date(nowMs + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
  };

  await store.createAccessToken(record);

  return { token, record, accountCreated: !existing };
}

/**
 * Resolve a personal access token string to the account it belongs to
 * (docs/agent-access-tokens.md).
 *
 * Shared by the two doors a token can arrive at: the `Authorization: Bearer` header on
 * the API, and the sign-in form at /oauth/token-login where a human pastes one into a
 * browser. Both must agree on every check — prefix, expiry, revocation, deleted accounts
 * — because a token the header path refuses but the form path accepts would be a way in
 * that no amount of reading either file alone would reveal.
 *
 * Returns null — never throws — for every failure. Distinguishing "expired" from
 * "revoked" from "never existed" would only tell a caller holding a stolen token which
 * one they hold.
 */
export async function resolveAccessTokenUser(store: Store, token: string, nowMs = Date.now()): Promise<User | null> {
  if (!looksLikeAccessToken(token)) return null;

  let tokenId: string;
  let secret: string;
  try {
    ({ tokenId, secret } = parseAccessToken(token));
  } catch {
    return null;
  }

  const record = await store.getAccessToken(tokenId);
  if (!record) return null;
  if (!verifyTokenSecret(secret, record.secretHash)) return null;
  // Fail closed on corrupt/missing expiresAt (NaN from Date.parse would otherwise read
  // as "not expired").
  if (isAccessTokenExpired(record.expiresAt, nowMs)) return null;

  const user = await store.getUser(record.uid);
  if (!user || user.deletionScheduledFor) return null;

  // Last-use tracking, coarsened to a day so a chatty agent costs one write rather than
  // one per request — the question it answers ("is anything still using this token?")
  // does not need finer resolution. Best-effort by design: bookkeeping must never turn a
  // working request into a failing one.
  const nowIso = new Date(nowMs).toISOString();
  if (record.lastUsedAt?.slice(0, 10) !== nowIso.slice(0, 10)) {
    void store.touchAccessToken(tokenId, nowIso).catch(() => {
      /* same contract as every other measurement in this file */
    });
  }

  return user;
}

/** The safe projection of a token record — everything except the hash of the secret. */
export interface PublicAccessToken {
  tokenId: string;
  uid: string;
  name: string;
  createdAt: string;
  createdByUid: string;
  expiresAt: string;
  lastUsedAt?: string;
  expired: boolean;
}

export function toPublicAccessToken(record: AccessTokenRecord, nowMs: number): PublicAccessToken {
  // Fields listed explicitly rather than spread-minus-`secretHash`: a future field added
  // to the record then has to be named here to escape, so the safe direction is the
  // default. This projection is the only thing standing between the token collection and
  // an HTTP response.
  return {
    tokenId: record.tokenId,
    uid: record.uid,
    name: record.name,
    createdAt: record.createdAt,
    createdByUid: record.createdByUid,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    expired: isAccessTokenExpired(record.expiresAt, nowMs),
  };
}
