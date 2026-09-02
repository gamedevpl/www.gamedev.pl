import { createTwoRegion, glyphs, wantsColor } from './renderer.js';
import { completeSlash, SLASH_VERBS } from './argv.js';
import { postTurn } from './turn.js';
import type { ApiClient } from './api.js';
import { answerDraft, beginIntake, formatQuestion, submitIdea, type IntakeDraft } from './create.js';

export type ReplLineResult = {
  next: 'continue' | 'quit';
  token?: string | null;
  draft?: IntakeDraft | null;
};

async function openFromSpec(
  api: ApiClient,
  spec: { title: string; concept: string },
  write: (s: string) => void,
): Promise<ReplLineResult> {
  const created = await submitIdea(api, spec.title, spec.concept);
  write(`▸ opened ${created.slug ?? created.token}`);
  return { next: 'continue', token: created.token, draft: null };
}

export async function handleReplLine(input: {
  line: string;
  api: ApiClient;
  token: string | null;
  draft?: IntakeDraft | null;
  write: (s: string) => void;
}): Promise<ReplLineResult> {
  const trimmed = input.line.trim();
  if (!trimmed) return { next: 'continue' };
  if (trimmed === '/quit' || trimmed === '/exit') return { next: 'quit' };
  if (trimmed === '/help') {
    input.write(SLASH_VERBS.map((verb) => `/${verb}`).join('\n'));
    return { next: 'continue' };
  }
  if (trimmed.startsWith('/') && !trimmed.includes(' ')) {
    const matches = completeSlash(trimmed);
    if (matches.length) input.write(matches.map((verb) => `/${verb}`).join('  '));
    return { next: 'continue' };
  }
  if (!input.token) {
    try {
      if (input.draft) {
        const answered = answerDraft(input.draft, trimmed);
        if (answered.kind === 'ask') {
          input.write(formatQuestion(answered.draft));
          return { next: 'continue', draft: answered.draft };
        }
        return await openFromSpec(input.api, answered, input.write);
      }
      const started = await beginIntake(input.api, trimmed);
      if (started.kind === 'ask') {
        input.write(formatQuestion(started.draft));
        return { next: 'continue', draft: started.draft };
      }
      return await openFromSpec(input.api, started, input.write);
    } catch (error) {
      input.write(error instanceof Error ? error.message : String(error));
      return { next: 'continue', draft: input.draft ?? null };
    }
  }
  const result = await postTurn(input.api, input.token, trimmed);
  if (result.kind === 'reply') input.write(`◆ ${result.text}`);
  else input.write(`▸ build ${result.roundId}${result.ack ? ` — ${result.ack}` : ''}`);
  return { next: 'continue' };
}

export function replBanner(isTty: boolean, env: NodeJS.ProcessEnv): string {
  const g = glyphs(wantsColor(env, isTty));
  return `${g.agent} gamedev — ${g.prompt} to talk, /help for verbs`;
}

export { createTwoRegion };
