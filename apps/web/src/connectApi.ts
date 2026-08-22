/**
 * Client for GET /api/submissions/:id/connect and creator-key management
 * (BY-03 / BY-27a / BY-27b).
 *
 * Connect returns a config block (MCP URL + Authorization header) and a keyless
 * kickoff prompt (slug only). The full Authorization value is for Copy only.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

import type { InstallSnippets } from '@gamedevpl/contract';
export { CONNECT_CLIENTS, type ConnectClient, type InstallSnippets } from '@gamedevpl/contract';

export type McpInstallLinks = {
  /** Credential-free Cursor deeplink (server URL only). */
  cursor: string;
  /** Credential-free VS Code deeplink (server URL only). */
  vscode: string;
};

export type ConnectPayload = {
  /** Display snippets — Authorization header is masked. */
  installSnippets: InstallSnippets;
  /**
   * One-click install deep links (BY-18c). Server URL only — never a credential.
   * Hand-copy snippets remain the universal path for every client.
   */
  installLinks: McpInstallLinks;
  /** Keyless kickoff — slug only, never a key. */
  kickoffPrompt: string;
  mcpUrl: string;
  /** Full Authorization header — hold in memory for Copy; never render. */
  authorizationHeader: string;
  authorizationHeaderMasked: string;
  fingerprint: string;
  /** Unix seconds — identical to the creator key's signed exp. */
  expiresAt: number;
  keyGeneration: number;
  slug: string;
  canSwitchToPlatform?: boolean;
};

export type ConnectApiError = Error & {
  status?: number;
  reason?: string;
  builder?: string;
};

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function throwResponseError(response: Response): Promise<never> {
  const body = (await readJson(response)) as {
    error?: string;
    reason?: string;
    builder?: string;
  } | null;
  const error = new Error(body?.error ?? `Request failed (${response.status})`) as ConnectApiError;
  error.status = response.status;
  if (body?.reason) error.reason = body.reason;
  if (body?.builder) error.builder = body.builder;
  throw error;
}

/**
 * Fetch the connect payload for an active self-build round.
 *
 * `:id` is the creator's status capability (same token Studio already holds). Requires
 * a signed-in session owned by the submission's creator.
 */
export async function getConnectPayload(token: string): Promise<ConnectPayload> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/connect`, {
    credentials: 'include',
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  const body = (await response.json()) as ConnectPayload;
  return body;
}

export type OAuthGrantSummary = {
  grantId: string;
  clientId: string;
  clientLabel: string;
  createdAt: string;
  lastUsedAt: string | null;
};

/** Connected coding-agent clients for the signed-in creator (BY-18b). */
export async function listOAuthGrants(): Promise<OAuthGrantSummary[]> {
  const response = await fetch(`${API_BASE}/api/me/oauth-grants`, { credentials: 'include' });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return (await response.json()) as OAuthGrantSummary[];
}

/** Revoke a connected client immediately. */
export async function revokeOAuthGrant(grantId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/me/oauth-grants/${encodeURIComponent(grantId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok && response.status !== 204) {
    await throwResponseError(response);
  }
}

export type CreatorAgentKeyPayload = {
  /** Full key — hold in memory for Copy; never render into the DOM. */
  key: string;
  keyGeneration: number;
  expiresAt: number;
  fingerprint: string;
  authorizationHeader: string;
  authorizationHeaderMasked: string;
  rotated?: boolean;
  revoked?: false;
};

/** Status when the key is revoked — no secret; mint again explicitly. */
export type CreatorAgentKeyRevokedStatus = {
  keyGeneration: number;
  revoked: true;
};

export type CreatorAgentKeyStatus = CreatorAgentKeyPayload | CreatorAgentKeyRevokedStatus;

/** Current creator-wide MCP opener (BY-27a). Remints at current gen, or reports revoked. */
export async function getCreatorAgentKey(): Promise<CreatorAgentKeyStatus> {
  const response = await fetch(`${API_BASE}/api/me/creator-agent-key`, { credentials: 'include' });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return (await response.json()) as CreatorAgentKeyStatus;
}

/** Mint after revoke (or first time). Does not reset generation. */
export async function mintCreatorAgentKey(): Promise<CreatorAgentKeyPayload> {
  const response = await fetch(`${API_BASE}/api/me/creator-agent-key`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return (await response.json()) as CreatorAgentKeyPayload;
}

/** Bump keyGeneration — agents holding the old key are cut off. */
export async function rotateCreatorAgentKey(): Promise<CreatorAgentKeyPayload> {
  const response = await fetch(`${API_BASE}/api/me/creator-agent-key/rotate`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return (await response.json()) as CreatorAgentKeyPayload;
}

/** Revoke the creator-wide key. Generation is preserved; remint needs an explicit mint. */
export async function revokeCreatorAgentKey(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/me/creator-agent-key`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok && response.status !== 204) {
    await throwResponseError(response);
  }
}
