import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export const CLI_VERSION = '0.1.0';
export const CLI_RELEASE_PREFIX = 'cli-v';
export const CLI_ASSET = 'gamedev';
export const CLI_RELEASES_DOWNLOAD = 'https://github.com/gamedevpl/www.gamedev.pl/releases/download';
export const CLI_RELEASES_API = 'https://api.github.com/repos/gamedevpl/www.gamedev.pl/releases?per_page=100';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function assetName(): string {
  return CLI_ASSET;
}

export function releaseUrl(version: string, file: string): string {
  return `${CLI_RELEASES_DOWNLOAD}/${CLI_RELEASE_PREFIX}${version}/${file}`;
}

export function expectedHash(sums: string, asset: string): string | null {
  for (const line of sums.split('\n')) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(\S+)$/);
    if (match && match[2] === asset) return match[1]!.toLowerCase();
  }
  return null;
}

export function defaultInstallDest(): string {
  return join(homedir(), '.local', 'bin', CLI_ASSET);
}

export function helperDest(binPath: string): string {
  const ext = /\.exe$/i.test(binPath) ? '.exe' : '';
  if (basename(binPath).toLowerCase() === `git-remote-gamedev${ext}`) return binPath;
  return join(dirname(binPath), `git-remote-gamedev${ext}`);
}

export async function resolveUpdateVersion(input: { version?: string; fetchImpl: FetchLike }): Promise<string> {
  if (input.version) return input.version.replace(/^cli-v/, '');
  const res = await input.fetchImpl(CLI_RELEASES_API, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return CLI_VERSION;
  const rows = (await res.json()) as Array<{ tag_name?: string }>;
  const tags = rows.map((row) => row.tag_name ?? '').filter((tag) => tag.startsWith(CLI_RELEASE_PREFIX));
  const newest = tags[0]?.slice(CLI_RELEASE_PREFIX.length);
  return newest || CLI_VERSION;
}

export async function updateCli(input: {
  dest: string;
  version?: string;
  fetchImpl?: FetchLike;
}): Promise<{ version: string; asset: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const version = await resolveUpdateVersion({ version: input.version, fetchImpl });
  const asset = assetName();
  const sumsRes = await fetchImpl(releaseUrl(version, 'SHA256SUMS'));
  if (!sumsRes.ok) {
    throw new CliError(`update: SHA256SUMS missing for cli-v${version}`, EXIT_REFUSED, 'wait for a cli-v* release');
  }
  const expected = expectedHash(await sumsRes.text(), asset);
  if (!expected) throw new CliError(`update: ${asset} not in SHA256SUMS`, EXIT_REFUSED);
  const binRes = await fetchImpl(releaseUrl(version, asset));
  if (!binRes.ok) throw new CliError(`update: could not fetch ${asset}`, EXIT_REFUSED);
  const buf = Buffer.from(await binRes.arrayBuffer());
  const actual = createHash('sha256').update(buf).digest('hex');
  if (actual !== expected) throw new CliError('update: checksum mismatch', EXIT_REFUSED);
  mkdirSync(dirname(input.dest), { recursive: true });
  writeFileSync(input.dest, buf, { mode: 0o755 });
  const helper = helperDest(input.dest);
  if (helper !== input.dest && dirname(helper) === dirname(input.dest)) {
    copyFileSync(input.dest, helper);
  }
  return { version, asset };
}
