export const SLASH_VERBS = [
  'games',
  'status',
  'share',
  'profile',
  'handle',
  'builder',
  'connect',
  'checkout',
  'quota',
  'notifications',
  'help',
  'login',
  'logout',
  'whoami',
  'submit',
  'pull',
  'diff',
  'update',
] as const;

export type SlashVerb = (typeof SLASH_VERBS)[number];

export function completeSlash(prefix: string): SlashVerb[] {
  const needle = prefix.replace(/^\//, '').toLowerCase();
  return SLASH_VERBS.filter((verb) => verb.startsWith(needle));
}

export function parseArgv(argv: string[]): { verb: string; args: string[]; flags: Record<string, string | boolean> } {
  const rest = argv.slice(2);
  const verb = rest[0] && !rest[0].startsWith('-') ? rest[0] : 'repl';
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const tokens = rest[0] && !rest[0].startsWith('-') ? rest.slice(1) : rest;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
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
  return { verb, args, flags };
}

export function jsonMode(flags: Record<string, string | boolean>): boolean {
  return flags.json === true || flags.json === 'true';
}
