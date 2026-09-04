import { CLI_BIN, cliUsage } from './bin-name.js';
import { glyphs, wantsColor } from './renderer.js';
import { completeSlash, parseArgv, SLASH_VERBS, type SlashVerb } from './argv.js';
import { getStatus, postTurn } from './turn.js';
import { formatStatusLines } from './status-watch.js';
import type { ApiClient } from './api.js';
import { dispatchReadVerb } from './verbs.js';
import { answerDraft, beginIntake, formatQuestion, submitIdea, type IntakeDraft } from './create.js';
import { CLI_VERSION } from './update.js';
import { MASCOT_ASCII } from './tui/mascot.js';

export type ReplLineResult = {
  next: 'continue' | 'quit';
  token?: string | null;
  slug?: string;
  draft?: IntakeDraft | null;
};

async function openFromSpec(
  api: ApiClient,
  spec: { title: string; concept: string },
  write: (s: string) => void,
): Promise<ReplLineResult> {
  const created = await submitIdea(api, spec.title, spec.concept);
  write(`▸ opened ${created.slug ?? created.token}`);
  return { next: 'continue', token: created.token, draft: null, slug: created.slug };
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
  if (trimmed.startsWith('/')) {
    const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
    if (cmd === 'help') {
      input.write(SLASH_VERBS.map((verb) => `/${verb}`).join('\n'));
      return { next: 'continue' };
    }
    if (cmd === 'status') {
      const tok = rest[0] || input.token;
      if (!tok) {
        input.write(`run it as ${cliUsage('status')}`);
        return { next: 'continue' };
      }
      try {
        const status = await getStatus(input.api, tok);
        input.write(formatStatusLines(status, input.api.origin).join('\n'));
      } catch (error) {
        input.write(error instanceof Error ? error.message : String(error));
      }
      return { next: 'continue' };
    }
    if (cmd && (SLASH_VERBS as readonly string[]).includes(cmd)) {
      const parsed = parseArgv(['node', 'cli', cmd, ...rest]);
      const chunks: string[] = [];
      const stdout = { write: (s: string) => (chunks.push(s), true) } as unknown as NodeJS.WriteStream;
      const code = await dispatchReadVerb({
        verb: cmd as SlashVerb,
        args: parsed.args,
        flags: parsed.flags,
        api: input.api,
        io: { stdout },
      });
      if (code !== null) {
        input.write(chunks.join('').trimEnd() || `/${cmd}`);
        return { next: 'continue' };
      }
      input.write(`run it as ${cliUsage(cmd)}`);
      return { next: 'continue' };
    }
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
  const hint = `${g.agent} ${CLI_BIN} ${CLI_VERSION} — ${g.prompt} to talk, /help for verbs`;
  return isTty ? `${MASCOT_ASCII}\n${hint}` : hint;
}
