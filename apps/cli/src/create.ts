import { CliError, EXIT_INPUT } from './exit-codes.js';
import type { ApiClient } from './api.js';

export interface RefineQuestion {
  id: string;
  prompt: string;
  choices?: string[];
}

export type IntakeDraft = {
  concept: string;
  title: string;
  questions: RefineQuestion[];
  index: number;
  answers: Record<string, string>;
};

type RefineApi = {
  questions?: Array<{ id: string; question: string; options?: Array<{ label: string }> }>;
  suggestedTitle?: string;
};

function titleFrom(idea: string, suggested?: string): string {
  const named = suggested?.trim();
  return named || idea.trim().slice(0, 40);
}

function toQuestions(api: RefineApi): RefineQuestion[] {
  return (api.questions ?? []).map((q) => ({
    id: q.id,
    prompt: q.question,
    ...(q.options?.length ? { choices: q.options.map((o) => o.label) } : {}),
  }));
}

function specFromDraft(draft: IntakeDraft): { title: string; concept: string } {
  const extra = draft.questions
    .map((q) => (draft.answers[q.id] ? `${q.prompt}: ${draft.answers[q.id]}` : ''))
    .filter(Boolean);
  return {
    title: draft.title,
    concept: extra.length ? `${draft.concept}\n\n${extra.join('\n')}` : draft.concept,
  };
}

export async function beginIntake(
  api: ApiClient,
  idea: string,
): Promise<{ kind: 'ready'; title: string; concept: string } | { kind: 'ask'; draft: IntakeDraft }> {
  const raw = await api.request<RefineApi>('POST', '/api/submissions/refine', { concept: idea });
  const questions = toQuestions(raw);
  const title = titleFrom(idea, raw.suggestedTitle);
  if (questions.length === 0) return { kind: 'ready', title, concept: idea };
  return { kind: 'ask', draft: { concept: idea, title, questions, index: 0, answers: {} } };
}

export function answerDraft(
  draft: IntakeDraft,
  answer: string,
): { kind: 'ready'; title: string; concept: string } | { kind: 'ask'; draft: IntakeDraft } {
  const q = draft.questions[draft.index];
  const answers = q ? { ...draft.answers, [q.id]: answer } : draft.answers;
  const next = { ...draft, answers, index: draft.index + 1 };
  if (next.index >= draft.questions.length) return { kind: 'ready', ...specFromDraft(next) };
  return { kind: 'ask', draft: next };
}

export function formatQuestion(draft: IntakeDraft): string {
  const q = draft.questions[draft.index];
  if (!q) return '';
  const choices = q.choices?.length ? ` (${q.choices.join(' / ')})` : '';
  return `? ${q.prompt}${choices}`;
}

export async function refineIdea(
  api: ApiClient,
  idea: string,
): Promise<{ questions: RefineQuestion[] } | { ready: true; title: string; concept: string }> {
  const started = await beginIntake(api, idea);
  return started.kind === 'ready'
    ? { ready: true, title: started.title, concept: started.concept }
    : { questions: started.draft.questions };
}

export async function submitIdea(
  api: ApiClient,
  title: string,
  concept: string,
): Promise<{ token: string; slug?: string }> {
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
