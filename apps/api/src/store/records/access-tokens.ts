/**
 * A personal access token issued to a user account (docs/agent-access-tokens.md).
 *
 * Stored in its own top-level collection rather than on the user document, for one
 * blunt reason: `User` objects are returned to clients by `/api/auth/me` and the
 * sign-in routes, and a credential record that rides along on the user is one
 * forgotten `delete` away from being served to a browser. Keeping it in a separate
 * collection means that can never happen, and it makes the lookup a point read on
 * the token id rather than a scan.
 *
 * `secretHash` is `sha256` of the secret half — the token itself is never stored, so
 * an operator who can read this collection still cannot authenticate as anyone.
 */
export interface AccessTokenRecord {
  tokenId: string;
  uid: string;
  secretHash: string;
  /** Operator-supplied label, so a list of tokens is readable a month later. */
  name: string;
  createdAt: string;
  /** Who minted it — an admin uid. Kept so issuance is attributable after the fact. */
  createdByUid: string;
  /** Expiry is mandatory: a credential for automation should not outlive its purpose. */
  expiresAt: string;
  /**
   * Best-effort last-use stamp, written at most once a day (like `User.activeDays`)
   * so a busy agent costs one write rather than one per request. Its job is answering
   * "is this token still in use?" before revoking it, which a day's resolution covers.
   */
  lastUsedAt?: string;
}
