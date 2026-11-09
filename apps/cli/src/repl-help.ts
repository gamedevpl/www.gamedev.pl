import { CLI_BIN } from './bin-name.js';
import { glyphs, wantsColor } from './renderer.js';
import { completeSlash, suggestSlash, type SlashVerb } from './argv.js';
import { CLI_VERSION } from './update.js';
import { MASCOT_ASCII } from './tui/mascot.js';

export function replBanner(isTty: boolean, env: NodeJS.ProcessEnv): string {
  const g = glyphs(wantsColor(env, isTty));
  const hint = `${g.agent} ${CLI_BIN} ${CLI_VERSION} — ${g.prompt} to talk, /help for verbs`;
  return isTty ? `${MASCOT_ASCII}\n${hint}` : hint;
}

export function writeSlashSuggestion(cmd: string, write: (text: string) => void): void {
  const matches = completeSlash(cmd);
  if (matches.includes(cmd as SlashVerb)) write(`/${cmd} is not available here. /help lists commands.`);
  else if (matches.length) write(matches.map((verb) => `/${verb}`).join('  '));
  else {
    const suggestion = suggestSlash(cmd);
    write(`Unknown command /${cmd}.${suggestion ? ` Did you mean /${suggestion}?` : ''} /help lists commands.`);
  }
}
