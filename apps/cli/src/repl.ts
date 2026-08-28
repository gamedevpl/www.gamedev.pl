import { createTwoRegion, glyphs, wantsColor } from './renderer.js';
import { completeSlash, SLASH_VERBS } from './argv.js';
import { postTurn } from './turn.js';
import type { ApiClient } from './api.js';

export async function handleReplLine(input: {
  line: string;
  api: ApiClient;
  token: string | null;
  write: (s: string) => void;
}): Promise<'continue' | 'quit'> {
  const trimmed = input.line.trim();
  if (trimmed === '/quit' || trimmed === '/exit') return 'quit';
  if (trimmed === '/help') {
    input.write(SLASH_VERBS.map((verb) => `/${verb}`).join('\n'));
    return 'continue';
  }
  if (trimmed.startsWith('/') && !trimmed.includes(' ')) {
    const matches = completeSlash(trimmed);
    if (matches.length) input.write(matches.map((verb) => `/${verb}`).join('  '));
    return 'continue';
  }
  if (!input.token) {
    input.write('no open game — /games or describe an idea');
    return 'continue';
  }
  const result = await postTurn(input.api, input.token, trimmed);
  if (result.kind === 'reply') input.write(`◆ ${result.text}`);
  else input.write(`▸ build ${result.roundId}${result.ack ? ` — ${result.ack}` : ''}`);
  return 'continue';
}

export function replBanner(isTty: boolean, env: NodeJS.ProcessEnv): string {
  const g = glyphs(wantsColor(env, isTty));
  return `${g.agent} gamedev — ${g.prompt} to talk, /help for verbs`;
}

export { createTwoRegion };
