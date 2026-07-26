// Client for written player feedback (docs/improvement-loop-plan.md, signal source
// #1). Unlike votesApi.ts there is no public read here — feedback has no aggregate
// view yet (that's IL-2's scorecard) — so this is a write-only client.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type PlayerFeedbackError = Error & { status?: number; category?: string };

export async function submitPlayerFeedback(slug: string, text: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/feedback`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; category?: string } | null;
    const error = new Error(body?.error ?? `Feedback request failed (${res.status})`) as PlayerFeedbackError;
    error.status = res.status;
    error.category = body?.category;
    throw error;
  }
}
