/** OAuth dynamic or CIMD-registered MCP client (BY-18b). */
export interface OAuthClientRecord {
  clientId: string;
  registrationType: 'dcr' | 'cimd';
  redirectUris: string[];
  clientName?: string;
  tokenEndpointAuthMethod: 'none';
  createdAt: string;
  ownerUid?: string;
}

/** Per-creator OAuth grant — scope is per creator (`mcp`), not per game. */
export interface OAuthGrantRecord {
  grantId: string;
  clientId: string;
  ownerUid: string;
  scope: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
  refreshFamilyId: string;
  currentRefreshTokenId: string;
  currentRefreshHash: string;
  refreshExpiresAt: string;
}

export interface OAuthAccessTokenRecord {
  tokenId: string;
  grantId: string;
  ownerUid: string;
  secretHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface OAuthAuthCodeRecord {
  codeId: string;
  codeHash: string;
  clientId: string;
  ownerUid: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  scope: string;
  expiresAt: string;
  usedAt?: string;
  grantId?: string;
}

export type RotateRefreshTokenResult =
  | { ok: true; grant: OAuthGrantRecord; previousRefreshTokenId: string }
  | { ok: false; reason: 'reuse' | 'invalid' | 'revoked' | 'expired' };
