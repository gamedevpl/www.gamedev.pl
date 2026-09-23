import type { ModerationFlagReason } from '@gamedevpl/contract';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type ReportGameError = Error & { status?: number; category?: string };

export async function submitGameReport(slug: string, reason: ModerationFlagReason, note: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/report`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason, note }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; category?: string } | null;
    const error = new Error(body?.error ?? `Report request failed (${res.status})`) as ReportGameError;
    error.status = res.status;
    error.category = body?.category;
    throw error;
  }
}
