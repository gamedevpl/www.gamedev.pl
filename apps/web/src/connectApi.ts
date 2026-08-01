/**
 * Client for GET /api/submissions/:id/connect (BY-03).
 *
 * Returns everything the Studio connect card needs: per-client install snippets
 * (MCP URL only) and the kickoff prompt that carries this round's key.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export const CONNECT_CLIENTS = ['claudeCode', 'codex', 'cursor', 'kimi', 'cli'] as const;
export type ConnectClient = (typeof CONNECT_CLIENTS)[number];

export type InstallSnippets = Record<ConnectClient, string>;

export type ConnectPayload = {
  installSnippets: InstallSnippets;
  kickoffPrompt: string;
  /** Unix seconds — identical to the round key's signed exp. */
  expiresAt: number;
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
