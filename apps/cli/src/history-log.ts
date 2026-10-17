import { createHash } from 'node:crypto';
import type { HistoryVersion } from '@gamedevpl/contract';
import type { ApiClient } from './api.js';
import { CliError, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import { historyRows, readHistoryTree } from './history-api.js';
import { sourceBytes } from './git-history-import.js';

type Flags = Record<string, string | boolean>;
export type LogOptions = { limit: number; since?: number; until?: number; grep?: RegExp; paths: string[] };

function dateFlag(flags: Flags, name: 'since' | 'until'): number | undefined {
  const value = flags[name];
  if (value === undefined) return;
  const fail = () => new CliError(`--${name} needs an ISO date or timestamp`, EXIT_INPUT);
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)
  )
    throw fail();
  const calendar = new Date(value.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) throw fail();
  const date = new Date(value.length === 10 ? value + 'T00:00:00' : value);
  if (!Number.isFinite(date.getTime())) throw fail();
  if (value.length === 10 && name === 'until') {
    date.setDate(date.getDate() + 1);
    date.setMilliseconds(-1);
  }
  return date.getTime();
}

export function logOptions(flags: Flags, paths: string[]): LogOptions {
  if (flags.all && flags.limit !== undefined) throw new CliError('--all and --limit cannot be combined', EXIT_INPUT);
  let limit = Infinity;
  if (flags.limit !== undefined) {
    limit = typeof flags.limit === 'string' ? Number(flags.limit) : NaN;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new CliError('--limit must be a positive integer', EXIT_INPUT);
  }
  const since = dateFlag(flags, 'since'),
    until = dateFlag(flags, 'until');
  if (since !== undefined && until !== undefined && since > until)
    throw new CliError('--since must not follow --until', EXIT_INPUT);
  let grep: RegExp | undefined;
  if (flags.grep !== undefined) {
    if (typeof flags.grep !== 'string') throw new CliError('--grep needs a pattern', EXIT_INPUT);
    try {
      grep = new RegExp(flags.grep, flags.i || flags['ignore-case'] ? 'i' : '');
    } catch {
      throw new CliError('--grep needs a valid regular expression', EXIT_INPUT);
    }
  }
  return { limit, since, until, grep, paths };
}

function matches(row: HistoryVersion, options: LogOptions): boolean {
  const date = Date.parse(row.createdAt);
  if (options.since !== undefined && !(date >= options.since)) return false;
  if (options.until !== undefined && !(date <= options.until)) return false;
  return !options.grep || options.grep.test(row.summary ?? '');
}

function pathMatches(path: string, selected: string): boolean {
  return path === selected || path.startsWith(selected.replace(/\/$/, '') + '/');
}

export async function* filteredHistory(
  api: ApiClient,
  slug: string,
  options: LogOptions,
  signal?: AbortSignal,
): AsyncGenerator<HistoryVersion> {
  const cache = new Map<string, Promise<string>>();
  const fingerprint = (row: HistoryVersion | undefined, path: string): Promise<string> => {
    if (!row?.sourceFiles.includes(path)) return Promise.resolve('absent');
    const key = row.version + '/' + path;
    let value = cache.get(key);
    if (!value) {
      value = readHistoryTree(api, slug, row.version, path, signal).then((tree) => {
        const file = tree.files.find((file) => file.path === path);
        if (!file) throw new CliError('version history is missing a source file', EXIT_REFUSED);
        return createHash('sha256').update(sourceBytes(file)).digest('hex');
      });
      cache.set(key, value);
    }
    return value;
  };
  const changed = async (row: HistoryVersion, parent?: HistoryVersion): Promise<boolean> => {
    const paths = new Set(
      [...row.sourceFiles, ...(parent?.sourceFiles ?? [])].filter((path) =>
        options.paths.some((selected) => pathMatches(path, selected)),
      ),
    );
    for (const path of paths) if ((await fingerprint(row, path)) !== (await fingerprint(parent, path))) return true;
    return false;
  };
  const pageSize =
    options.paths.length || options.grep || options.since !== undefined || options.until !== undefined
      ? 100
      : Math.min(100, options.limit);
  const rows = historyRows(api, slug, pageSize, signal);
  try {
    let current = await rows.next(),
      count = 0;
    while (!current.done) {
      signal?.throwIfAborted();
      const parent = options.paths.length ? await rows.next() : undefined;
      const older = parent && !parent.done ? parent.value : undefined;
      const row = current.value;
      if (matches(row, options) && (!options.paths.length || (await changed(row, older)))) {
        yield row;
        if (++count >= options.limit) return;
      }
      for (const key of cache.keys()) if (!older || !key.startsWith(older.version + '/')) cache.delete(key);
      current = parent ?? (await rows.next());
    }
  } finally {
    await rows.return(undefined);
  }
}
