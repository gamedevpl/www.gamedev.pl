// GO-03: invite editors by recipient code. Access starts only after accept.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type EditorInviteStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

export interface EditorInviteSummary {
  slug: string;
  status: EditorInviteStatus;
  you: 'sender' | 'recipient';
  counterparty: { profileName: string };
  memberKey: string;
  createdAt: string;
  expiresAt: string;
}

export interface EditorMember {
  memberKey: string;
  role: 'owner' | 'editor';
  profileName: string;
  you: boolean;
}

export interface EditorsPayload {
  viewerRole: 'owner' | 'editor' | null;
  owner: EditorMember | null;
  editors: EditorMember[];
  invites: EditorInviteSummary[];
}

export type EditorInviteApiError = Error & {
  status?: number;
  code?: string;
};

async function throwResponseError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  const error = new Error(body?.error ?? `Request failed (${response.status})`) as EditorInviteApiError;
  error.status = response.status;
  error.code = body?.error;
  throw error;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as T;
}

const forSlug = (slug: string) => `/api/me/studio/games/${encodeURIComponent(slug)}/editors`;

export async function fetchGameEditors(slug: string): Promise<EditorsPayload> {
  return request<EditorsPayload>(forSlug(slug));
}

export async function inviteGameEditor(slug: string, recipientCode: string): Promise<EditorInviteSummary> {
  return (
    await request<{ invite: EditorInviteSummary }>(`${forSlug(slug)}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientCode }),
    })
  ).invite;
}

export async function cancelEditorInvite(slug: string, memberKey: string): Promise<EditorInviteSummary> {
  return (
    await request<{ invite: EditorInviteSummary }>(`${forSlug(slug)}/invites/${encodeURIComponent(memberKey)}/cancel`, {
      method: 'POST',
    })
  ).invite;
}

export async function removeGameEditor(slug: string, memberKey: string): Promise<void> {
  await request<{ ok: true }>(`${forSlug(slug)}/${encodeURIComponent(memberKey)}/remove`, { method: 'POST' });
}

export async function leaveGameEditors(slug: string): Promise<void> {
  await request<{ ok: true }>(`${forSlug(slug)}/leave`, { method: 'POST' });
}

export async function fetchIncomingEditorInvites(): Promise<EditorInviteSummary[]> {
  const body = await request<{ invites?: unknown }>('/api/me/editor-invites/incoming');
  return Array.isArray(body.invites) ? (body.invites as EditorInviteSummary[]) : [];
}

export async function respondToEditorInvite(slug: string, decision: 'accept' | 'reject'): Promise<EditorInviteSummary> {
  const path = `/api/me/editor-invites/${encodeURIComponent(slug)}/${decision}`;
  return (await request<{ invite: EditorInviteSummary }>(path, { method: 'POST' })).invite;
}
