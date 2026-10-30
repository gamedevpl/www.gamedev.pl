import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { readTarEntries } from '../src/platform/tar.js';

export function apiKitEngines(options: { directory: string; repoUrl: string; refs: string[]; token?: string }) {
  if (!options.refs.length || options.refs.some((ref) => !/^[a-f0-9]{40}$/.test(ref))) {
    throw new Error('Engine fetch requires immutable refs');
  }
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ATTR_NOSYSTEM: '1',
  };
  for (const name of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'NODE_EXTRA_CA_CERTS',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'TMPDIR',
  ]) {
    if (process.env[name]) env[name] = process.env[name]!;
  }
  if (options.token) {
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${options.token}`).toString('base64')}`;
  }
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: options.directory,
      env,
      timeout: 600_000,
      maxBuffer: 256 * 1024 * 1024,
    });
  git(['init', '--quiet']);
  git(['config', 'core.hooksPath', '/dev/null']);
  git(['remote', 'add', 'origin', options.repoUrl]);
  git(['fetch', '--quiet', '--no-tags', '--filter=blob:none', '--depth=1', 'origin', ...options.refs]);
  const refs = new Set(options.refs);
  return async (ref: string): Promise<Record<string, string>> => {
    if (!refs.has(ref)) throw new Error('Engine ref is outside the verified Kit window');
    const archive = git(['archive', '--format=tar', '--prefix=shared/', `${ref}:shared`]);
    const files: Record<string, string> = {};
    for await (const entry of readTarEntries(Readable.from(archive), { maxTotalBytes: 128 * 1024 * 1024 })) {
      if (!entry.path.startsWith('shared/')) throw new Error('Engine export escaped shared sources');
      files[entry.path] = Buffer.from(entry.bytes).toString('base64');
    }
    return files;
  };
}
