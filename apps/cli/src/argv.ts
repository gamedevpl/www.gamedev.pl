export const SLASH_VERBS = [
  'recover',
  'agents',
  'model',
  'logs',
  'log',
  'show',
  'blame',
  'restore',
  'revert',
  'kit',
  'play',
  'stop',
  'games',
  'status',
  'share',
  'profile',
  'handle',
  'builder',
  'connect',
  'delegate',
  'checkout',
  'git',
  'quota',
  'notifications',
  'help',
  'login',
  'logout',
  'whoami',
  'submit',
  'pull',
  'push',
  'publish',
  'diff',
  'update',
  'permissions',
] as const;

export type SlashVerb = (typeof SLASH_VERBS)[number];

export const CLI_VERBS = [...SLASH_VERBS.filter((verb) => verb !== 'logs'), 'create', 'repl'] as const;

export function completeSlash(prefix: string): SlashVerb[] {
  const needle = prefix.replace(/^\//, '').toLowerCase();
  return SLASH_VERBS.filter((verb) => verb.startsWith(needle));
}

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

function suggestCommand<T extends string>(command: string, verbs: readonly T[]): T | undefined {
  const needle = command.replace(/^\//, '').toLowerCase();
  let best: { verb: T; distance: number } | undefined;
  for (const verb of verbs) {
    if (Math.abs(needle.length - verb.length) > 2) continue;
    const distance = editDistance(needle, verb);
    if (distance <= 2 && (!best || distance < best.distance)) best = { verb, distance };
  }
  return best?.verb;
}

export function suggestSlash(command: string): SlashVerb | undefined {
  return suggestCommand(command, SLASH_VERBS);
}

export function suggestVerb(command: string): (typeof CLI_VERBS)[number] | undefined {
  if (command.replace(/^\//, '').toLowerCase() === 'logs') return undefined;
  return suggestCommand(command, CLI_VERBS);
}

export const VERSION_VALUE_VERBS = new Set(['blame', 'checkout', 'restore', 'revert']);
const BOOLEAN_FLAGS = new Set([
  'git',
  'play',
  'edit',
  'terminal',
  'detach',
  'preview',
  'yes',
  'manual',
  'reset',
  'no-open',
  'no-browser',
  'loopback',
  'device-flow',
  'stop',
  'list',
  'all',
  'oneline',
  'no-pager',
  'ignore-case',
  'force',
  'dry-run',
  'recover',
  'publish',
  'handoff',
  'takeover',
  'submit',
  'json',
  'help',
  'platform',
  'version',
]);

function slashTokens(line: string): string[] {
  const tokens: string[] = [];
  let token = '',
    quote = '',
    started = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quote) {
      if (char === quote) quote = '';
      else if (quote === '"' && char === '\\' && /["\\]/.test(line[i + 1] ?? '')) token += line[++i];
      else token += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) tokens.push(token);
      token = '';
      started = false;
    } else if (char === '\\' && /[\s"'\\]/.test(line[i + 1] ?? '')) {
      token += line[++i];
      started = true;
    } else {
      token += char;
      started = true;
    }
  }
  if (quote) throw new Error('close the quoted log argument');
  if (started) tokens.push(token);
  return tokens;
}

export function parseArgv(argv: string[] | string): {
  verb: string;
  args: string[];
  flags: Record<string, string | boolean>;
  paths?: string[];
} {
  const rest = typeof argv === 'string' ? slashTokens(argv.replace(/^\//, '')) : argv.slice(2);
  const noPager = rest[0] === '--no-pager';
  if (noPager) rest.shift();
  const verb = rest[0] && !rest[0].startsWith('-') ? rest[0] : 'repl';
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  if (noPager) flags['no-pager'] = true;
  let paths: string[] | undefined;
  const tokens = rest[0] && !rest[0].startsWith('-') ? rest.slice(1) : rest;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token === '--') {
      if (verb === 'log') paths = tokens.slice(i + 1);
      else args.push(...tokens.slice(i + 1));
      break;
    }
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        const name = body.slice(0, eq),
          value = body.slice(eq + 1);
        flags[name] = BOOLEAN_FLAGS.has(name) && (value === 'true' || value === 'false') ? value === 'true' : value;
      } else {
        const versionValue =
          body === 'version' && VERSION_VALUE_VERBS.has(verb) && tokens[i + 1] && !tokens[i + 1]!.startsWith('-');
        if (BOOLEAN_FLAGS.has(body) && !versionValue) {
          flags[body] = true;
          continue;
        }
        const next = tokens[i + 1];
        if (next && !next.startsWith('-')) {
          flags[body] = next;
          i += 1;
        } else {
          flags[body] = true;
        }
      }
    } else if (token.startsWith('-') && token.length === 2) {
      flags[token.slice(1)] = true;
    } else {
      args.push(token);
    }
  }
  return { verb, args, flags, ...(paths ? { paths } : {}) };
}

export function jsonMode(flags: Record<string, string | boolean>): boolean {
  return flags.json === true || flags.json === 'true';
}
