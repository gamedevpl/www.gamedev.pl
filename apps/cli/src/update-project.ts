import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { childEnv, spawnCommand } from './delegate.js';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { expectedHash, releaseUrl, type FetchLike } from './update.js';
import { withCheckoutWriter } from './workbench-lock.js';

const PACKAGE = '@gamedevpl/cli';
type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

export function npmCliProject(cwd: string): string | undefined {
  let root = resolve(cwd);
  for (;;) {
    const path = join(root, 'package.json');
    if (existsSync(path)) {
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
      return manifest.dependencies?.[PACKAGE] || manifest.devDependencies?.[PACKAGE] ? root : undefined;
    }
    const parent = dirname(root);
    if (parent === root) return;
    root = parent;
  }
}

async function npm(root: string, args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
  const child = spawnCommand({ command: 'npm', args, cwd: root, env: childEnv(env, ''), abort: signal });
  let output = '';
  for (const stream of [child.stdout, child.stderr])
    stream?.on('data', (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-2000);
    });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0 && !signal.aborted) resolve();
      else
        reject(
          new CliError(
            signal.aborted ? 'Project CLI update timed out.' : `Project CLI update failed: ${output.trim()}`,
            EXIT_REFUSED,
            'Retry gamedevpl update in this project.',
          ),
        );
    });
  });
}

export async function updateProjectCli(input: {
  root: string;
  version: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  onProgress?: (message: string) => void;
  timeoutMs?: number;
}): Promise<{ version: string }> {
  return withCheckoutWriter(input.root, async () => {
    const signal = AbortSignal.timeout(input.timeoutMs ?? 120_000);
    const request: FetchLike = (url) => (input.fetchImpl ?? fetch)(url, { signal });
    const asset = 'gamedevpl-npm.tgz';
    const url = releaseUrl(input.version, asset);
    input.onProgress?.('Verifying project CLI download…');
    const sums = await request(releaseUrl(input.version, 'SHA256SUMS'));
    const expected = sums.ok ? expectedHash(await sums.text(), asset) : null;
    if (!expected) throw new CliError('Project CLI checksum is missing.', EXIT_REFUSED);
    const archive = await request(url);
    if (!archive.ok) throw new CliError('Project CLI download failed.', EXIT_REFUSED);
    const bytes = Buffer.from(await archive.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new CliError('Project CLI checksum mismatch.', EXIT_REFUSED);
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    const manifestPath = join(input.root, 'package.json');
    const lockPath = join(input.root, 'package-lock.json');
    const manifest = readFileSync(manifestPath);
    const lock = existsSync(lockPath) ? readFileSync(lockPath) : undefined;
    const kind = (JSON.parse(manifest.toString()) as Manifest).dependencies?.[PACKAGE] ? '--save-prod' : '--save-dev';
    const flags = ['--ignore-scripts', '--no-audit', '--no-fund'];
    const checkLock = () => {
      const record = JSON.parse(readFileSync(lockPath, 'utf8')).packages?.[`node_modules/${PACKAGE}`];
      if (record?.version !== input.version || record?.resolved !== url || record?.integrity !== integrity)
        throw new CliError('Project CLI lock does not match the verified release.', EXIT_REFUSED);
    };
    try {
      input.onProgress?.(`Updating project CLI dependency to ${input.version}…`);
      await npm(
        input.root,
        ['install', '--package-lock-only', kind, ...flags, `${PACKAGE}@${url}`],
        input.env ?? process.env,
        signal,
      );
      checkLock();
    } catch (error) {
      writeFileSync(manifestPath, manifest);
      if (lock) writeFileSync(lockPath, lock);
      else rmSync(lockPath, { force: true });
      throw error;
    }
    input.onProgress?.('Installing verified project CLI…');
    await npm(input.root, ['install', ...flags], input.env ?? process.env, signal);
    checkLock();
    const installed = JSON.parse(readFileSync(join(input.root, 'node_modules', PACKAGE, 'package.json'), 'utf8'));
    if (installed.name !== PACKAGE || installed.version !== input.version)
      throw new CliError('Installed project CLI does not match the release.', EXIT_REFUSED, 'Retry gamedevpl update.');
    return { version: installed.version };
  });
}
