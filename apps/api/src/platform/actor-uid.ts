// Apple `sub` values contain dots; encode them on the wire.
export const ACTOR_UID_RE = /^[A-Za-z0-9:._-]+$/;

export function encodeActorUidField(uid: string): string {
  return Buffer.from(uid, 'utf8').toString('base64url');
}

export function decodeActorUidField(raw: string): string | undefined {
  if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) return undefined;
  try {
    const uid = Buffer.from(raw, 'base64url').toString('utf8');
    return ACTOR_UID_RE.test(uid) ? uid : undefined;
  } catch {
    return undefined;
  }
}
