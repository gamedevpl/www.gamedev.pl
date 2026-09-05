import { CLI_BIN, cliUsage } from './bin-name.js';
import { glyphs, wantsColor } from './renderer.js';
import { completeSlash, parseArgv, SLASH_VERBS, type SlashVerb } from './argv.js';
import { getStatus, postTurn } from './turn.js';
import { formatStatusLines } from './status-watch.js';
import type { ApiClient } from './api.js';
import { dispatchReadVerb } from './verbs.js';
import { postCliChat } from './chat.js';
import { CLI_VERSION } from './update.js';
import { formatError } from './errors.js';
import { formatHelp } from './help.js';
import { MASCOT_ASCII } from './tui/mascot.js';

export type ReplLineResult = {
  next: 'continue' | 'quit';
  token?: string | null;
  slug?: string;
  conversationId?: string;
};

export async function handleReplLine(input: {
  line: string;
  api: ApiClient;
  token: string | null;
  conversationId?: string;
  write: (s: string) => void;
}): Promise<ReplLineResult> {
  const trimmed = input.line.trim();
  if (!trimmed) return { next: 'continue' };
  if (trimmed === '/quit' || trimmed === '/exit') return { next: 'quit' };
  if (trimmed.startsWith('/')) {
    const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
    if (cmd === 'help') {
      input.write(formatHelp(true));
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
        input.write(formatError(error));
      }
      return { next: 'continue' };
    }
    if (cmd && (SLASH_VERBS as readonly string[]).includes(cmd)) {
      try {
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
      } catch (error) {
        input.write(formatError(error));
        return { next: 'continue' };
      }
    }
    const matches = completeSlash(trimmed);
    if (matches.length) input.write(matches.map((verb) => `/${verb}`).join('  '));
    return { next: 'continue' };
  }
  if (!input.token) {
    try {
      const result = await postCliChat(input.api, trimmed, input.conversationId);
      if (result.kind === 'create') {
        input.write(`▸ opened ${result.slug}${result.ack ? ` — ${result.ack}` : ''}`);
        return { next: 'continue', token: result.token, slug: result.slug };
      }
      input.write(`◆ ${result.text}`);
      return { next: 'continue', conversationId: result.conversationId };
    } catch (error) {
      input.write(formatError(error));
      return { next: 'continue', conversationId: input.conversationId };
    }
  }
  try {
    const result = await postTurn(input.api, input.token, trimmed);
    if (result.kind === 'reply') input.write(`◆ ${result.text}`);
    else input.write(`▸ build ${result.roundId}${result.ack ? ` — ${result.ack}` : ''}`);
    return { next: 'continue' };
  } catch (error) {
    input.write(formatError(error));
    return { next: 'continue' };
  }
}

export function replBanner(isTty: boolean, env: NodeJS.ProcessEnv): string {
  const g = glyphs(wantsColor(env, isTty));
  const hint = `${g.agent} ${CLI_BIN} ${CLI_VERSION} — ${g.prompt} to talk, /help for verbs`;
  return isTty ? `${MASCOT_ASCII}\n${hint}` : hint;
}
