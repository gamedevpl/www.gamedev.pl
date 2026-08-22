/**
 * Durable per-game agent opener state (BY-23), stored at `gameAgentKeys/{slug}`.
 *
 * The HMAC opener itself is never stored — only the generation that revokes it.
 * Round close does not bump `keyGeneration`; only an explicit creator rotate does.
 * `allowAgentOpenRounds` was the BY-24 opt-in. Retained on the record type for existing
 * Firestore documents only — BY-27b dropped the writer and all readers (no migration).
 */
export interface GameAgentKeyRecord {
  slug: string;
  ownerUid: string;
  keyGeneration: number;
  createdAt: string;
  updatedAt: string;
  /**
   * Legacy BY-24 opt-in. Retained for existing records; nothing reads or writes it after BY-27b.
   */
  allowAgentOpenRounds?: boolean;
  /** BY-24: admission lock while `open_round` is creating a job — cleared in finally. */
  agentOpenRoundPending?: boolean;
}

/**
 * Durable creator-wide agent opener state (BY-27a), stored at `creatorAgentKeys/{uid}`.
 *
 * The HMAC opener itself is never stored — only the generation that revokes it.
 * Bumped only by an explicit creator rotate/revoke; never on round close or publish.
 * Revoke must NOT delete the doc: deleting would let the next mint restart at
 * generation 1 and resurrect a previously leaked gen-1 key until its exp.
 */
export interface CreatorAgentKeyRecord {
  ownerUid: string;
  keyGeneration: number;
  createdAt: string;
  updatedAt: string;
  /** Set by revoke; cleared on the next explicit mint. */
  revokedAt?: string;
}
