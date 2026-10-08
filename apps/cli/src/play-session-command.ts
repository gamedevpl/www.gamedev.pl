import { stopPlaySession } from './play.js';
import { listPlaySessions, sessionLines } from './play-sessions.js';
import { CliError, EXIT_INPUT } from './exit-codes.js';

export async function playSessionCommand(input: {
  verb: string;
  args: string[];
  flags: Record<string, string | boolean>;
  cwd: string;
  write: (line: string) => void;
  json?: (value: unknown) => void;
  onLocalPreview?: (url: string) => void;
}): Promise<boolean> {
  if (input.verb !== 'play' && input.verb !== 'stop') return false;
  const { flags, args } = input;
  if (
    (flags.list !== undefined && typeof flags.list !== 'boolean') ||
    (flags.all !== undefined && typeof flags.all !== 'boolean') ||
    (flags.session !== undefined && (typeof flags.session !== 'string' || !flags.session))
  )
    throw new CliError('Use --list, --all, or --session <id> from gamedevpl play --list.', EXIT_INPUT);
  const stop = input.verb === 'stop' || flags.stop === true || args[0] === 'stop';
  const slugArgs = args[0] === 'stop' ? args.slice(1) : args;
  if (flags.list === true) {
    if (stop || slugArgs.length || flags.all || flags.session || flags.edit)
      throw new CliError('Use gamedevpl play --list without a stop target.', EXIT_INPUT);
    const sessions = await listPlaySessions();
    if (input.json) input.json({ sessions });
    else sessionLines(sessions).forEach((line) => input.write(line));
    return true;
  }
  if (stop) {
    if (
      slugArgs.length > 1 ||
      flags.edit ||
      (flags.all !== undefined && typeof flags.all !== 'boolean') ||
      (flags.session !== undefined && typeof flags.session !== 'string')
    )
      throw new CliError('Use gamedevpl play --stop [slug], --session <id>, or --all.', EXIT_INPUT);
    const stopped = await stopPlaySession({
      cwd: input.cwd,
      slug: slugArgs[0],
      all: flags.all === true,
      session: typeof flags.session === 'string' ? flags.session : undefined,
      write: input.write,
      onLocalPreview: input.onLocalPreview,
    });
    input.json?.({ stopped });
    return true;
  }
  if (flags.all || flags.session) throw new CliError('--all and --session require gamedevpl play --stop.', EXIT_INPUT);
  const sessions = await listPlaySessions();
  if (sessions.length) sessionLines(sessions).forEach((line) => input.write(line));
  return false;
}
