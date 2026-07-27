// Client for the public contact form → POST /api/contact → admin@gamedev.pl.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type ContactError = Error & { status?: number; category?: string };

export interface ContactPayload {
  name: string;
  email: string;
  message: string;
}

export async function submitContact(payload: ContactPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/api/contact`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; category?: string } | null;
    const error = new Error(body?.error ?? `Contact request failed (${res.status})`) as ContactError;
    error.status = res.status;
    error.category = body?.category;
    throw error;
  }
}
