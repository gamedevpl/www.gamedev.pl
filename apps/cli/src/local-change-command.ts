import type { ApiClient } from './api.js';
import { findCheckout, pullGame } from './checkout.js';
import { jsonMode } from './argv.js';
import { sanitizePath, stripTerminalControls } from './ansi.js';
import { CliError, EXIT_GREEN, EXIT_INPUT } from './exit-codes.js';
import { abortLocalOperation, finishLocalOperation, operationSummary, resolveLocalPath } from './local-operation.js';
import { stashCommand } from './local-stash.js';
import { withCheckoutWriter } from './workbench-lock.js';

type Input = {
  api: ApiClient;
  args: string[];
  flags: Record<string, string | boolean>;
  cwd: string;
  write: (line: string) => void;
};
export function formatLocalChange(result: object): string {
  if ('stashes' in result) {
    const rows = result.stashes as { ref: string; id: string; message: string; changes: unknown[] }[];
    return (
      rows
        .map((row) => `${row.ref} ${row.id} — ${stripTerminalControls(row.message)} (${row.changes.length} paths)`)
        .join('\n') || 'No local stashes.'
    );
  }
  if ('stash' in result) {
    const row = result.stash as { ref: string; message: string; changes: { path: string; kind: string }[] };
    return [
      `${'saved' in result ? 'Saved ' : ''}${row.ref}: ${stripTerminalControls(row.message)}`,
      ...row.changes.map((file) => `  ${file.kind}: ${sanitizePath(file.path)}`),
    ].join('\n');
  }
  if ('conflicts' in result) {
    const row = result as ReturnType<typeof operationSummary>;
    return row
      ? [
          `Pending ${row.kind} merge (${row.phase})`,
          ...row.conflicts.map((c) => `  ${c.resolved ? 'resolved' : c.kind}: ${c.paths.map(sanitizePath).join(', ')}`),
          'Edit text conflicts, then resolve <path>; or resolve <path> --ours|--theirs|--delete.',
          `Next: ${row.next}`,
        ].join('\n')
      : 'No pending merge.';
  }
  if ('aborted' in result && 'backup' in result)
    return `Merge aborted. Edits made during resolution are backed up at ${sanitizePath(String(result.backup))}.`;
  if ('completed' in result) return 'Merge completed. Sources remain local; review gamedevpl diff before pushing.';
  if ('resolved' in result)
    return `Resolved: ${(result.resolved as string[]).map(sanitizePath).join(', ')}. Run resolve to inspect remaining paths.`;
  if ('dropped' in result) return `Dropped stash ${String(result.dropped)}.`;
  if ('message' in result) return String(result.message);
  return 'No pending merge.';
}

export async function resolveCommand(input: Input, expected?: 'pull' | 'stash') {
  const here = findCheckout(input.cwd);
  if (!here) throw new CliError('Run resolve inside a game checkout.', EXIT_INPUT);
  const { flags, args } = input;
  const choices = ['ours', 'theirs', 'delete'].filter((key) => flags[key] === true),
    modes = ['continue', 'abort'].filter((key) => flags[key] === true);
  if (
    Object.keys(flags).some((key) => !['ours', 'theirs', 'delete', 'continue', 'abort', 'json'].includes(key)) ||
    Object.entries(flags).some(([key, value]) => key !== 'json' && typeof value !== 'boolean') ||
    args.length > 1 ||
    choices.length > 1 ||
    modes.length > 1 ||
    (modes.length && (args.length || choices.length)) ||
    (choices.length && !args.length)
  )
    throw new CliError('usage: resolve [path [--ours|--theirs|--delete]] | --continue | --abort', EXIT_INPUT);
  return withCheckoutWriter(
    here.root,
    async () => {
      if (flags.continue === true) return finishLocalOperation(input.api, here.root, expected);
      if (flags.abort === true) return abortLocalOperation(input.api, here.root, expected);
      if (args[0])
        return resolveLocalPath(input.api, here.root, args[0], choices[0] as 'ours' | 'theirs' | 'delete' | undefined);
      return operationSummary(here.root) ?? {};
    },
    { history: true, resolveMerge: true, reclaimHistory: true },
  );
}

export async function localChangeCommand(input: Input & { verb: 'stash' | 'resolve' }) {
  const result = input.verb === 'stash' ? await stashCommand(input) : await resolveCommand(input);
  input.write(jsonMode(input.flags) ? JSON.stringify(result) : formatLocalChange(result));
  return EXIT_GREEN;
}

export async function runPullCommand(input: Input): Promise<number> {
  const { args, flags } = input;
  if (
    Object.keys(flags).some((key) => !['force', 'continue', 'abort', 'json'].includes(key)) ||
    Object.entries(flags).some(([key, value]) => key !== 'json' && typeof value !== 'boolean') ||
    args.length > 2
  )
    throw new CliError('usage: pull [slug [directory]] [--force] | --continue | --abort', EXIT_INPUT);
  if (flags.continue === true || flags.abort === true) {
    if (args.length || flags.force)
      throw new CliError('Pull completion takes no slug, directory or --force.', EXIT_INPUT);
    const result = await resolveCommand(input, 'pull');
    input.write(jsonMode(flags) ? JSON.stringify(result) : formatLocalChange(result));
    return EXIT_GREEN;
  }
  const here = args[0] ? null : findCheckout(input.cwd),
    slug = args[0] ?? here?.slug;
  if (!slug) throw new CliError('Run pull in a checkout or provide a slug.', EXIT_INPUT);
  const result = await pullGame({
    api: input.api,
    slug,
    dest: args[1] ?? here?.root ?? input.cwd,
    force: flags.force === true,
  });
  input.write(
    jsonMode(flags)
      ? JSON.stringify(result)
      : [
          `pulled ${slug} @ ${result.version}${result.kept.length ? `; kept local ${result.kept.map(sanitizePath).join(', ')}` : ''}`,
          ...result.notices,
        ].join('\n'),
  );
  return EXIT_GREEN;
}
