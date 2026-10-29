import { cp, mkdtemp, readFile, realpath, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createGitHubClient } from '../src/catalog/github-client.js';
import { createGameArtifactBrowser } from '../src/catalog/game-artifact-browser.js';
import { assembleGameHtml, projectFromSources } from '../src/platform/assemble.js';

function required(name: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`Missing --${name}`);
  return process.argv[at + 1];
}

export async function verifyInstalledKit(options: {
  kitDir: string;
  engineSourceRoot: string;
  engineRef: string;
  consumerSha: string;
  tarballSha256: string;
  executablePath: string;
  noSandbox?: boolean;
}) {
  if (
    !/^[0-9a-f]{40}$/.test(options.engineRef) ||
    !/^[0-9a-f]{40}$/.test(options.consumerSha) ||
    !/^[0-9a-f]{64}$/.test(options.tarballSha256)
  )
    throw new Error('Kit verification requires immutable identities');
  const consumerRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const actualConsumer = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: consumerRoot, encoding: 'utf8' }).trim();
  if (actualConsumer !== options.consumerSha) throw new Error('Consumer checkout does not match deployed API');
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: consumerRoot });
  const kitDir = await realpath(options.kitDir);
  const engineSourceRoot = await realpath(options.engineSourceRoot);
  if ((await readFile(path.join(engineSourceRoot, 'engine-ref.txt'), 'utf8')).trim() !== options.engineRef) {
    throw new Error('API engine source does not match the candidate ref');
  }
  const kit = JSON.parse(await readFile(path.join(kitDir, 'kit.json'), 'utf8')) as { engineRef?: string };
  if (kit.engineRef !== options.engineRef) throw new Error('Installed Kit has a different engine ref');
  const workspace = await mkdtemp(path.join(tmpdir(), 'kit-browser-'));
  const previousRoot = process.env.GAMEDEV_REPO_ROOT;
  process.env.GAMEDEV_REPO_ROOT = workspace;
  let browser: Awaited<ReturnType<typeof createGameArtifactBrowser>> | undefined;
  try {
    browser = await createGameArtifactBrowser(options);
    const starter = path.join(kitDir, 'starters', 'block-cascade');
    for (const slug of ['ordinary-probe', 'hot-probe']) {
      await cp(starter, path.join(workspace, 'games', slug), { recursive: true });
    }
    const hotRoot = path.join(workspace, 'games', 'hot-probe');
    const manifest = JSON.parse(await readFile(path.join(hotRoot, 'GAME.json'), 'utf8')) as Record<string, unknown>;
    manifest.hot = {
      protocol: 1,
      id: 'kit-probe',
      stateVersion: 1,
      observationVersion: 1,
      behavior: 'game/behavior.ts',
    };
    await writeFile(path.join(hotRoot, 'GAME.json'), JSON.stringify(manifest));
    await mkdir(path.join(hotRoot, 'game'), { recursive: true });
    await writeFile(
      path.join(hotRoot, 'game.ts'),
      `
export default function boot(builder) {
  return builder.renderer({width:320,height:180}).input({steer:'origin'}).audio()
    .init(()=>({ticks:0}));
}`,
    );
    await writeFile(
      path.join(hotRoot, 'game', 'behavior.ts'),
      `
export default {
  update(round){round.ticks++},
  render(round,kit){kit.draw.clear('#112233');kit.draw.rect(10+round.ticks%100,20,10,10,'#ffee11')},
  snapshot(round){return {ticks:round.ticks}}
}`,
    );
    const read = async (file: string): Promise<Buffer | null> => {
      const root = file.startsWith('shared/') ? engineSourceRoot : file.startsWith('games/') ? workspace : null;
      if (!root) return null;
      const resolved = path.resolve(root, file);
      if (!resolved.startsWith(root + path.sep)) throw new Error('Kit source escaped its root');
      try {
        const canonical = await realpath(resolved);
        if (!canonical.startsWith(root + path.sep)) throw new Error('Kit source symlink escaped its root');
        return await readFile(canonical);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return null;
      }
    };
    const client = createGitHubClient({
      token: 'offline-kit-verification',
      repo: 'local/kit',
      fetchImpl: async () => Response.json({ sha: options.engineRef }),
      files: {
        readText: async (file) => (await read(file))?.toString('utf8') ?? null,
        readBytes: async (file) => read(file),
      },
    });
    const assemblerPath = path.join(kitDir, 'tools/lib/assemble.js');
    const sdk = (await import(
      pathToFileURL(existsSync(assemblerPath) ? assemblerPath : assemblerPath.slice(0, -3) + '.ts').href
    )) as {
      assembleGame(slug: string): { html: string };
    };
    const artifacts = [];
    for (const slug of ['ordinary-probe', 'hot-probe']) {
      const native = sdk.assembleGame(slug);
      const sources = await client.getGameSources(options.engineRef, slug);
      if (!sources) throw new Error(`Kit API sources missing for ${slug}`);
      const api = await assembleGameHtml(projectFromSources(sources, slug), { restrictNetwork: true });
      for (const [lane, html] of [
        ['sdk', native.html],
        ['api', api],
      ] as const) {
        const verified = await browser.verify({ slug, title: slug, html, engineRef: options.engineRef });
        artifacts.push({ lane, slug, ...verified });
      }
    }
    return {
      version: 1,
      engineRef: options.engineRef,
      consumerSha: options.consumerSha,
      tarballSha256: options.tarballSha256,
      artifacts,
    };
  } finally {
    await browser?.close();
    if (previousRoot === undefined) delete process.env.GAMEDEV_REPO_ROOT;
    else process.env.GAMEDEV_REPO_ROOT = previousRoot;
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function verifyKitArchive(options: {
  tarball: string;
  engineSourceRoot: string;
  engineRef: string;
  consumerSha: string;
  tarballSha256: string;
  executablePath: string;
  noSandbox?: boolean;
}) {
  const archive = path.resolve(options.tarball);
  const hash = async () =>
    createHash('sha256')
      .update(await readFile(archive))
      .digest('hex');
  if ((await hash()) !== options.tarballSha256) throw new Error('Kit archive hash does not match verification request');
  const install = await mkdtemp(path.join(tmpdir(), 'kit-install-'));
  try {
    await writeFile(
      path.join(install, 'package.json'),
      JSON.stringify({ private: true, dependencies: { '@gamedevpl/game-kit': `file:${archive}` } }),
    );
    execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: install,
      env: { ...process.env, npm_config_cache: path.join(install, 'npm-cache') },
      stdio: 'inherit',
      timeout: 600_000,
    });
    if ((await hash()) !== options.tarballSha256) throw new Error('Kit archive changed during installation');
    return await verifyInstalledKit({ ...options, kitDir: path.join(install, 'node_modules/@gamedevpl/game-kit') });
  } finally {
    await rm(install, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await verifyKitArchive({
    tarball: required('tarball'),
    engineSourceRoot: required('engine-source-root'),
    engineRef: required('engine-ref'),
    consumerSha: required('consumer-sha'),
    tarballSha256: required('tarball-sha256'),
    executablePath: process.env.E2E_CHROMIUM_PATH ?? '',
    noSandbox: process.env.E2E_CHROMIUM_NO_SANDBOX === '1',
  });
  await writeFile(required('output'), JSON.stringify(result) + '\n', { mode: 0o600 });
  console.log(
    `Verified installed Kit ${result.engineRef} with API ${result.consumerSha}: ${result.artifacts.length} browser artifacts`,
  );
}
