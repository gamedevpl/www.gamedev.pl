// Client for the generated tiles shown against a visual CreatorQA question.

import { API_BASE } from './submissionApi.js';

export type OptionImage = { label: string; image: string };

// Tiles for one visual question, asked for separately so refine stays fast.
export async function fetchOptionImages(
  input: {
    concept: string;
    question: string;
    options: Array<{ label: string; detail?: string }>;
  },
  signal?: AbortSignal,
): Promise<OptionImage[]> {
  const response = await fetch(`${API_BASE}/api/submissions/option-images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });

  // The survey works without pictures, so refusal means silence.
  if (!response.ok) return [];

  const body = (await response.json()) as { images?: OptionImage[] };
  return body.images ?? [];
}
