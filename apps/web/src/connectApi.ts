/**
 * Client for GET /api/submissions/:id/connect and durable game key management (BY-03 / BY-23).
 *
 * Returns everything the Studio connect card needs: per-client install snippets
 * (MCP URL only) and the kickoff prompt that carries this game's durable key.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export const CONNECT_CLIENTS = ['claudeCode', 'codex', 'cursor', 'kimi', 'cli'] as const;
export type ConnectClient = (typeof CONNECT_CLIENTS)[number];

export type InstallSnippets = Record<ConnectClient, string>;

export type ConnectPayload = {
  installSnippets: InstallSnippets;
  kickoffPrompt: string;
  /** Unix seconds — identical to the game key's signed exp. */
  expiresAt: number;
  /** Current keyGeneration — display/rotate UI; not a secret. */
  keyGeneration?: number;
  /** True when this kickoff is the same durable key the creator already pasted. */
  sameKeyAsBefore?: boolean;
};

export type AgentKeyPayload = ConnectPayload & {
  slug: string;
  keyGeneration: number;
  allowAgentOpenRounds: boolean;
  rotated?: boolean;
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

/** Remint the durable game key at the current generation (fresh exp, no rotate). */
export async function getAgentKey(token: string): Promise<AgentKeyPayload> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/agent-key`, {
    credentials: 'include',
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as AgentKeyPayload;
}

/** Bump keyGeneration and return a fresh kickoff — agents holding the old key are cut off. */
export async function rotateAgentKey(token: string): Promise<AgentKeyPayload> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/agent-key/rotate`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as AgentKeyPayload;
}

/** Opt in or out of agent-opened improvement rounds for this game (BY-24). */
export async function setAgentOpenRounds(token: string, allow: boolean): Promise<{ allowAgentOpenRounds: boolean }> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/agent-key/open-rounds`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ allow }),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as { allowAgentOpenRounds: boolean };
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
