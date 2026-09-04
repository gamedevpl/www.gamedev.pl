import type { ApiClient } from './api.js';
import { cliUsage } from './bin-name.js';
import { jsonMode } from './argv.js';
import { CliError, EXIT_GREEN, EXIT_INPUT } from './exit-codes.js';
import { defaultInstallDest, updateCli } from './update.js';

type Flags = Record<string, string | boolean>;
type Io = { stdout: NodeJS.WriteStream };

function emit(io: Io, asJson: boolean, data: unknown, line: string): void {
  io.stdout.write(asJson ? `${JSON.stringify(data)}\n` : `${line}\n`);
}

export function formatQuotaLine(data: Record<string, unknown>): string {
  const submissions = data.submissions as { used?: number; limit?: number | null } | undefined;
  if (!submissions || typeof submissions.used !== 'number') return JSON.stringify(data);
  if (submissions.limit == null) return `${submissions.used} submissions today (no daily ceiling)`;
  return `${submissions.used} of ${submissions.limit} submissions today`;
}

export async function dispatchReadVerb(input: {
  verb: string;
  args: string[];
  flags: Flags;
  api: ApiClient;
  io: Io;
}): Promise<number | null> {
  const asJson = jsonMode(input.flags);
  const { verb, args, api, io, flags } = input;

  if (verb === 'games') {
    const data = await api.request<{ submissions?: Array<{ slug?: string | null; title?: string }> }>(
      'GET',
      '/api/submissions/mine',
    );
    const rows = data.submissions ?? [];
    emit(io, asJson, data, rows.map((row) => row.slug ?? row.title ?? '?').join('\n') || '(none)');
    return EXIT_GREEN;
  }
  if (verb === 'profile') {
    const data = await api.request<{ handle?: string; uid?: string }>('GET', '/api/me/profile');
    emit(io, asJson, data, data.handle ?? data.uid ?? 'signed in');
    return EXIT_GREEN;
  }
  if (verb === 'quota') {
    const data = await api.request<Record<string, unknown>>('GET', '/api/me/quota');
    emit(io, asJson, data, formatQuotaLine(data));
    return EXIT_GREEN;
  }
  if (verb === 'notifications') {
    const data = await api.request<unknown>('GET', '/api/notifications');
    emit(io, asJson, data, JSON.stringify(data));
    return EXIT_GREEN;
  }
  if (verb === 'share') {
    const slug = args[0];
    if (!slug) throw new CliError(cliUsage('share', '<slug>'), EXIT_INPUT, '<slug>');
    const url = `${api.origin}/play/${slug}`;
    emit(io, asJson, { url }, url);
    return EXIT_GREEN;
  }
  if (verb === 'handle') {
    const handle = args[0] ?? (typeof flags.handle === 'string' ? flags.handle : undefined);
    if (!handle) {
      const data = await api.request<{ handle?: string }>('GET', '/api/me/profile');
      emit(io, asJson, data, data.handle ?? '(none)');
      return EXIT_GREEN;
    }
    const data = await api.request<unknown>('POST', '/api/me/profile/handle', { handle });
    emit(io, asJson, data, `handle ${handle}`);
    return EXIT_GREEN;
  }
  if (verb === 'builder') {
    const slug = args[0];
    if (!slug) throw new CliError(cliUsage('builder', '<slug>'), EXIT_INPUT, '<slug>');
    const studio = await api.request<{ games?: Array<{ slug?: string; token?: string }> }>(
      'GET',
      `/api/me/studio?game=${encodeURIComponent(slug)}`,
    );
    const row = (studio.games ?? []).find((game) => game.slug === slug);
    if (!row?.token) throw new CliError(`no owned game ${slug}`, EXIT_INPUT, '<slug>');
    const data = await api.request<{ builder?: string }>('GET', `/api/submissions/${encodeURIComponent(row.token)}`);
    emit(io, asJson, data, data.builder ?? 'unknown');
    return EXIT_GREEN;
  }
  if (verb === 'update') {
    const dest = typeof flags.dest === 'string' ? flags.dest : defaultInstallDest();
    const version = typeof flags.version === 'string' ? flags.version : undefined;
    const result = await updateCli({ dest, version });
    emit(io, asJson, result, `updated ${result.asset} to ${result.version}`);
    return EXIT_GREEN;
  }
  return null;
}
