import type { PlayJournal } from './workbench-launch.js';
import { matchingCheckout } from './local-recovery.js';
import { findCheckout } from './checkout.js';
import { CliError, EXIT_INPUT } from './exit-codes.js';

export type WorkbenchEntry = { mode: 'home' | 'create' | 'game'; slug?: string };

export function selectWorkbenchEntry(input: {
  verb: string;
  args: string[];
  flags: Record<string, string | boolean>;
  interactive: boolean;
  bare: boolean;
  cwd: string;
}): { entry: WorkbenchEntry; cwd: string; idea?: string } | undefined {
  const { verb, args, flags, interactive, bare, cwd } = input;
  if (flags.help || flags.h || verb === 'help') return;
  const explicit = (verb === 'create' && flags.play === true) || (verb === 'play' && flags.edit === true);
  if (explicit && (flags.json || flags.terminal || flags.preview || flags.stop))
    throw new CliError(
      'Browser workbench flags cannot be combined with --json, --terminal, --preview or --stop.',
      EXIT_INPUT,
    );
  if (!explicit && (!interactive || flags.json || flags.terminal || flags.preview || flags.stop)) return;
  if (verb === 'create') return { entry: { mode: 'create' }, cwd, idea: args.join(' ').trim() || undefined };
  if (verb === 'repl' && bare && !args.length && !flags.token) return { entry: { mode: 'home' }, cwd };
  if (verb !== 'play') return;
  if (args.length > 1 || (args[0] && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(args[0])))
    throw new CliError('Use gamedevpl play [game-slug].', EXIT_INPUT);
  const local = args[0] ? matchingCheckout(cwd, args[0]) : findCheckout(cwd);
  const slug = args[0] ?? local?.slug;
  return { entry: { mode: slug ? 'game' : 'home', slug }, cwd: local?.root ?? cwd };
}

export function workbenchScope(cwd: string, entry?: WorkbenchEntry): string {
  return !entry || (entry.mode === 'game' && findCheckout(cwd)?.slug === entry.slug)
    ? cwd
    : `${cwd}\n${entry.mode}\n${entry.slug ?? ''}`;
}

export function workerEntry(journal: PlayJournal) {
  const local = findCheckout(journal.cwd);
  const checkout =
    journal.checkout ??
    (!journal.launch || (journal.launch.mode === 'game' && local?.slug === journal.launch.slug)
      ? (local ?? undefined)
      : undefined);
  const slug = journal.slug ?? journal.launch?.slug;
  return {
    checkout,
    slug,
    initialLine:
      journal.initial ??
      (checkout ? (journal.token ? '/play' : `/checkout ${checkout.slug}`) : slug ? `/checkout ${slug}` : undefined),
  };
}
export function assertRequestedGame(existing: PlayJournal | undefined, entry?: WorkbenchEntry) {
  const current = existing?.slug ?? existing?.checkout?.slug ?? existing?.launch?.slug;
  if (existing && (!existing.ended || existing.pending) && entry?.mode === 'game' && current && current !== entry.slug)
    throw Error(
      `This session now edits ${current}. Use its Commands to open ${entry.slug}, or end that session before launching another. The active task was not interrupted.`,
    );
}
