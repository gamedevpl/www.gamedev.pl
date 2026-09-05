import { looksLikeAsAccessToken, verifyAsAccessToken, type VerifiedAsAccessToken } from './oauth-tokens.js';
import { cliSurfaceEnabled } from './cli-surface.js';
import type { Store } from './store.js';

export { looksLikeAsAccessToken };

export const MCP_SCOPE = 'mcp';
export const CREATOR_SCOPE = 'creator';
export const OAUTH_SCOPES = [MCP_SCOPE, CREATOR_SCOPE] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const MAX_OAUTH_GRANTS_PER_UID = 10;
export const OAUTH_GRANT_CAP_DESCRIPTION = 'too many connected clients - revoke one in Studio';

export function advertisedOAuthScopes(env: NodeJS.ProcessEnv = process.env): OAuthScope[] {
  return cliSurfaceEnabled(env) ? [MCP_SCOPE, CREATOR_SCOPE] : [MCP_SCOPE];
}

export function parseOAuthScopes(raw: string | undefined, env: NodeJS.ProcessEnv = process.env): OAuthScope[] | null {
  const tokens = (raw ?? MCP_SCOPE).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const unique: OAuthScope[] = [];
  for (const token of tokens) {
    if (token !== MCP_SCOPE && token !== CREATOR_SCOPE) return null;
    if (!unique.includes(token)) unique.push(token);
  }
  if (unique.includes(CREATOR_SCOPE) && !cliSurfaceEnabled(env)) return null;
  return unique;
}

export function formatOAuthScope(scopes: readonly string[]): string {
  return scopes.join(' ');
}

export function scopeIncludes(scope: string, needed: string): boolean {
  return scope.split(/\s+/).includes(needed);
}

export function scopeHasMcp(scope: string): boolean {
  return scopeIncludes(scope, MCP_SCOPE);
}

export async function verifyMcpAsAccessToken(
  store: Store,
  token: string,
  nowMs: number = Date.now(),
): Promise<VerifiedAsAccessToken | null> {
  const access = await verifyAsAccessToken(store, token, nowMs);
  if (!access || !scopeHasMcp(access.scope)) return null;
  return access;
}
