// The operator half of the abuse-report path.
const API_BASE = '';

export interface ModerationFlagRow {
  id: string;
  slug: string;
  source: 'catalog' | 'creator';
  reason: string;
  note: string;
  raisedByUid: string;
  createdAt: string;
  status: 'open' | 'resolved';
  action: 'taken_down' | 'dismissed' | null;
  resolvedAt: string | null;
  resolvedByUid: string | null;
  resolutionNote: string | null;
}

export interface ModerationResolveResult {
  blocked: boolean;
  unshared: boolean;
  unpublished: boolean;
  stillPublic: boolean;
}

export async function fetchModerationFlags(status: 'open' | 'resolved' = 'open'): Promise<ModerationFlagRow[] | null> {
  const res = await fetch(`${API_BASE}/api/admin/moderation-flags?status=${status}`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`moderation flags failed (${res.status})`);
  return ((await res.json()) as { flags: ModerationFlagRow[] }).flags;
}

export async function resolveModerationFlag(
  id: string,
  action: 'taken_down' | 'dismissed',
  note?: string,
): Promise<ModerationResolveResult> {
  const res = await fetch(`${API_BASE}/api/admin/moderation-flags/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...(note ? { note } : {}) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `resolve failed (${res.status})`);
  }
  return (await res.json()) as ModerationResolveResult;
}
