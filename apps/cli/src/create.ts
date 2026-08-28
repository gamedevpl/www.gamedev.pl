import { CliError, EXIT_INPUT } from './exit-codes.js';
import type { ApiClient } from './api.js';

export interface RefineQuestion {
  id: string;
  prompt: string;
  choices?: string[];
}

export async function refineIdea(
  api: ApiClient,
  idea: string,
): Promise<{ questions: RefineQuestion[] } | { ready: true; title: string; concept: string }> {
  return api.request('POST', '/api/submissions/refine', { concept: idea });
}

export async function submitIdea(
  api: ApiClient,
  title: string,
  concept: string,
): Promise<{ token: string; jobId: number }> {
  return api.request('POST', '/api/submissions', { title, concept });
}

export function answersFromFlags(
  flags: Record<string, string | boolean>,
  questions: RefineQuestion[],
): Record<string, string> {
  const raw = typeof flags.answers === 'string' ? flags.answers : '';
  if (!raw && questions.length > 0) {
    throw new CliError('refine questions need --answers or a TTY', EXIT_INPUT, '--answers');
  }
  const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  return parsed;
}
