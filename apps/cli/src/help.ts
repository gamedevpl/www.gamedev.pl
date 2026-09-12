import { CLI_BIN } from './bin-name.js';
import { CLI_VERSION } from './update.js';
import { SLASH_VERBS, type SlashVerb } from './argv.js';

export const BLURB: Record<SlashVerb, string> = {
  recover: 'recover local sources after cancellation/deletion — recover [dir] [--slug <name>] --yes',
  play: 'open the game; live reload in a checkout — play [slug] [--no-open|--stop]',
  kit: 'check or update this checkout’s Creator Kit — kit [update]',
  logs: 'show the full transcript of the last local task (interactive session)',
  model: 'view or choose delegated model and effort — model [agent]',
  agents: 'detect local agents and show supported modes',
  games: 'list your games',
  status: 'round status — status <token>',
  share: 'play URL — share <slug>',
  profile: 'signed-in profile',
  handle: 'get or set handle',
  builder: 'who builds — builder <slug>, or self|platform here',
  connect: 'open a game session — connect <slug>; --manual for MCP setup',
  delegate: 'local agent edits the checkout — delegate <task>',
  checkout: 'download and open local files — checkout [slug]',
  quota: "today's submission budget",
  notifications: 'unread notifications',
  help: 'this list',
  login: 'open a browser and sign in',
  logout: 'forget the stored grant',
  whoami: 'print the signed-in identity',
  submit: 'alias for push — deliver a preview from local files',
  push: 'send local changes as a preview after checks — push [dir] [--publish]',
  pull: 'update a checkout from the platform',
  diff: 'three-way sync against the checkout base',
  update: 'install a newer CLI',
};

export function formatHelp(slash = false): string {
  const prefix = slash ? '/' : '';
  const rows = SLASH_VERBS.map((verb) => `  ${(prefix + verb).padEnd(18)}${BLURB[verb]}`);
  const intro = slash
    ? [
        `${CLI_BIN} ${CLI_VERSION}`,
        '',
        '  type to talk — a game starts when you ask · /quit to leave',
        '  in a checkout: say what to change; a local agent edits it, /push delivers a preview',
        '  /retry resumes a task waiting for builder handoff',
        '',
      ]
    : [
        `${CLI_BIN} ${CLI_VERSION} — Studio from a terminal`,
        '',
        `  ${CLI_BIN.padEnd(24)}interactive conversation`,
        `  ${`${CLI_BIN} repl <slug>`.padEnd(24)}interactive session for an existing game`,
        `  ${`${CLI_BIN} <verb>`.padEnd(24)}one-shot command`,
        '',
      ];
  return [...intro, ...rows].join('\n');
}
