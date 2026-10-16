import { CLI_BIN } from './bin-name.js';
import { CLI_VERSION } from './update.js';
import { jsonMode, SLASH_VERBS, type SlashVerb } from './argv.js';

export function printVersion(flags: Record<string, string | boolean>, write: (line: string) => void): boolean {
  if (flags.version !== true && flags.V !== true) return false;
  write(`${jsonMode(flags) ? JSON.stringify({ version: CLI_VERSION }) : CLI_VERSION}\n`);
  return true;
}

export const BLURB: Record<SlashVerb, string> = {
  recover: 'recover local sources after cancellation/deletion — recover [dir] [--slug <name>] --yes',
  play: 'open the browser workbench — play [slug]; --detach for background; --preview for raw preview; --list for running sessions; --stop [--session <id>|--all] to stop',
  stop: 'stop local Play — stop [slug] [--session <id>|--all]',
  kit: 'check or update this checkout’s Creator Kit — kit [update]',
  logs: 'show the full transcript of the last local task (interactive session)',
  log: 'delivered history in a pager — log [slug] [--limit N] [--since DATE] [--until DATE] [--grep REGEX] [-i] [--oneline] [--no-pager] [-- paths…]',
  show: 'version metadata and patch — show <version> [--slug <slug>]',
  blame: 'last version changing each line — blame <file> [--version <version>] [--slug <slug>]',
  model: 'view or choose delegated model and effort — model [agent]',
  agents: 'detect local agents and show supported modes',
  permissions: 'agent approvals — permissions [ask|auto|yolo]; default Auto with a sandbox, Ask for other agents',
  games: 'list your games',
  status: 'working copy in a checkout; interactive sessions also show the round — status [token]',
  share: 'play URL — share <slug>',
  profile: 'signed-in profile',
  handle: 'get or set handle',
  builder: 'who builds — builder <slug> globally; choose [self|platform] in a checkout',
  connect: 'open a game session — connect <slug>; --manual for MCP setup',
  delegate: 'local agent edits the checkout — delegate <task>; offers handoff if needed',
  checkout: 'download and open local files — checkout [slug]',
  quota: "today's submission budget",
  notifications: 'unread notifications',
  help: 'this list',
  login: `approve sign-in on gamedev.pl — ${CLI_BIN} login [--no-browser] [--loopback | --device-flow]`,
  logout: 'forget the stored grant',
  whoami: 'print the signed-in identity',
  submit: 'alias for push — deliver a preview from local files',
  push: 'send local changes as a preview after checks — push [dir] [--publish]',
  publish: 'alias for push --publish — submit for operator publication',
  pull: 'update a checkout from the platform',
  diff: 'working-copy patch; diff <v1> <v2> [--slug <slug>] compares delivered versions',
  update: 'update the CLI and this project’s npm CLI dependency',
};

export function formatHelp(slash = false): string {
  const prefix = slash ? '/' : '';
  const rows = SLASH_VERBS.map(
    (verb) =>
      `  ${(prefix + verb).padEnd(18)}${slash && verb === 'play' ? 'open the current game with live preview' : BLURB[verb]}`,
  );
  const intro = slash
    ? [
        `${CLI_BIN} ${CLI_VERSION}`,
        '',
        '  type to talk — a game starts when you ask · /quit to leave',
        '  in a checkout: say what to change; a local agent edits it, /push delivers a preview',
        '  in the terminal: !<command> runs locally · Ctrl+C stops it',
        '  /retry resumes a task waiting for builder handoff',
        '',
      ]
    : [
        `${CLI_BIN} ${CLI_VERSION} — Studio from a terminal`,
        '',
        `  ${CLI_BIN.padEnd(24)}open your browser workspace`,
        `  ${CLI_BIN} create [idea]          create in the browser (interactive)`,
        `  ${CLI_BIN} play [slug]            open a game in the browser (interactive)`,
        `  ${CLI_BIN} [play] --detach       run the browser workspace in the background`,
        `  ${CLI_BIN} stop [slug]            stop Play in this checkout; --all stops all`,
        `  ${CLI_BIN} --terminal           interactive conversation in the terminal`,
        `  ${CLI_BIN} --version            print the installed CLI version (-V)`,
        `  ${CLI_BIN} play --preview       open the raw game preview`,
        `  ${CLI_BIN} play --list          list running local Play sessions`,
        `  ${CLI_BIN} play --stop --all    stop all local Play sessions`,
        `  ${CLI_BIN} create --play [idea]  explicit browser launch without a TTY`,
        `  ${`${CLI_BIN} repl <slug>`.padEnd(24)}interactive session for an existing game`,
        `  ${`${CLI_BIN} <verb>`.padEnd(24)}one-shot command`,
        '',
        '  Browser sessions stay in this terminal. Ctrl+C ends Play; --detach runs in the background.',
        '',
      ];
  return [...intro, ...rows].join('\n');
}
