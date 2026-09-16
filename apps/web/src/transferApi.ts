// GO-02: hand a game to another creator by code.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type TransferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

export interface TransferSummary {
  slug: string;
  // Names the offer a response must answer, not the slug it is about.
  invitationId: string;
  status: TransferStatus;
  // Which side the viewer is on.
  you: 'sender' | 'recipient';
  counterparty: { profileName: string | null };
  createdAt: string;
  expiresAt: string;
}

export type TransferApiError = Error & {
  status?: number;
  // The server's machine-readable error code.
  code?: string;
};

async function throwResponseError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  const error = new Error(body?.error ?? `Request failed (${response.status})`) as TransferApiError;
  error.status = response.status;
  error.code = body?.error;
  throw error;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as T;
}

const forSlug = (slug: string) => `/api/me/studio/games/${encodeURIComponent(slug)}/transfer`;

// A 2xx body promises nothing about its shape.
function oneOrNull(body: { transfer?: TransferSummary | null }): TransferSummary | null {
  return body.transfer ?? null;
}

function codeOrThrow(body: { code?: unknown }): string {
  if (typeof body.code !== 'string' || body.code.length === 0) throw new Error('missing code');
  return body.code;
}

// Minted on first read, so a real account never 404s.
export async function fetchRecipientCode(): Promise<string> {
  return codeOrThrow(await request<{ code?: unknown }>('/api/me/recipient-code'));
}

export async function rotateRecipientCode(): Promise<string> {
  return codeOrThrow(await request<{ code?: unknown }>('/api/me/recipient-code/rotate', { method: 'POST' }));
}

// The open invitation, or null when there is none.
export async function fetchGameTransfer(slug: string): Promise<TransferSummary | null> {
  return oneOrNull(await request<{ transfer?: TransferSummary | null }>(forSlug(slug)));
}

export async function startGameTransfer(slug: string, recipientCode: string): Promise<TransferSummary> {
  return (
    await request<{ transfer: TransferSummary }>(forSlug(slug), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientCode }),
    })
  ).transfer;
}

export async function cancelGameTransfer(slug: string, invitationId: string): Promise<TransferSummary> {
  return (
    await request<{ transfer: TransferSummary }>(`${forSlug(slug)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationId }),
    })
  ).transfer;
}

export async function fetchIncomingTransfers(): Promise<TransferSummary[]> {
  const body = await request<{ transfers?: unknown }>('/api/me/transfers/incoming');
  return Array.isArray(body.transfers) ? (body.transfers as TransferSummary[]) : [];
}

export async function respondToTransfer(
  slug: string,
  decision: 'accept' | 'reject',
  invitationId: string,
): Promise<TransferSummary> {
  const path = `/api/me/transfers/${encodeURIComponent(slug)}/${decision}`;
  return (
    await request<{ transfer: TransferSummary }>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationId }),
    })
  ).transfer;
}
