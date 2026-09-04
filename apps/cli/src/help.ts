import { CLI_BIN } from './bin-name.js';
import { CLI_VERSION } from './update.js';
import { SLASH_VERBS, type SlashVerb } from './argv.js';

const BLURB: Record<SlashVerb, string> = {
  games: 'list your games',
  status: 'round status — status <token>',
  share: 'play URL — share <slug>',
  profile: 'signed-in profile',
  handle: 'get or set handle',
  builder: 'who is building — builder <slug>',
  connect: 'MCP / agent connect',
  checkout: 'clone a game — checkout <slug>',
  quota: "today's submission budget",
  notifications: 'unread notifications',
  help: 'this list',
  login: 'open a browser and sign in',
  logout: 'forget the stored grant',
  whoami: 'print the signed-in identity',
  submit: 'run the local gate, no upload',
  pull: 'refresh a checkout',
  diff: 'unreconciled local files',
  update: 'install a newer CLI',
};

export function formatHelp(slash = false): string {
  const prefix = slash ? '/' : '';
  const rows = SLASH_VERBS.map((verb) => `  ${(prefix + verb).padEnd(18)}${BLURB[verb]}`);
  const intro = slash
    ? [`${CLI_BIN} ${CLI_VERSION}`, '', '  type to talk · ↑/↓ history · /quit to leave', '']
    : [
        `${CLI_BIN} ${CLI_VERSION} — Studio from a terminal`,
        '',
        `  ${CLI_BIN.padEnd(18)}interactive REPL`,
        `  ${`${CLI_BIN} <verb>`.padEnd(18)}one-shot command`,
        '',
      ];
  return [...intro, ...rows].join('\n');
}
