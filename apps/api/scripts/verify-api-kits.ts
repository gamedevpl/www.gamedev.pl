import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  apiKitPlan,
  assertApiKitPlanUnchanged,
  validateApiKitEvidence,
  type ApiKitPlan,
} from '../src/platform/api-kit-compatibility.js';
import { apiKitContainerArgs, apiKitStarter } from '../src/platform/api-kit-input.js';
import { fetchGamesRepoArchive } from '../src/platform/games-repo-archive.js';
import type { ApiKitInput } from './verify-api-kit-artifacts.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
function option(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing --${name}`);
  return process.argv[index + 1];
}
const bucket = option('bucket');
const sourceSha = option('source-sha');
const receiptPath = path.resolve(option('receipt'));
const candidate = new URL(option('candidate-url'));
if (!/^[a-z0-9][a-z0-9._-]+$/.test(bucket) || !/^[a-f0-9]{40}$/.test(sourceSha)) {
  throw new Error('API verification requires a bucket and full source SHA');
}
if (
  candidate.protocol !== 'https:' ||
  !candidate.hostname.endsWith('.run.app') ||
  candidate.username ||
  candidate.password
) {
  throw new Error('API verification requires the HTTPS Cloud Run candidate URL');
}
function run(command: string, args: string[], cwd = root): Buffer {
  return execFileSync(command, args, { cwd, timeout: 600_000, maxBuffer: 512 * 1024 * 1024 });
}
function object(name: string): Buffer {
  return run('gcloud', ['storage', 'cat', `gs://${bucket}/${name}`]);
}
async function plan(): Promise<ApiKitPlan> {
  const raw = object('kits/current.json').toString('utf8');
  const listing = run('gcloud', ['storage', 'ls', `gs://${bucket}/kits/*.json`]).toString('utf8');
  const sidecars: Record<string, string> = {};
  for (const url of listing.split('\n')) {
    const match = new RegExp(`^gs://[^/]+/kits/([a-f0-9]{40})\\.json$`).exec(url.trim());
    if (match) sidecars[match[1]] = object(`kits/${match[1]}.json`).toString('utf8');
  }
  return apiKitPlan(raw, sidecars);
}
async function assertCandidate(): Promise<void> {
  const response = await fetch(new URL('/api/health', candidate), {
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || ((await response.json()) as { buildSha?: string }).buildSha !== sourceSha) {
    throw new Error('Deployed API candidate does not match the verified source');
  }
}

if (process.argv.includes('--recheck')) {
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as {
    version: number;
    consumerSha: string;
    candidateUrl: string;
    plan: ApiKitPlan;
    results: { modes: string[]; evidence: unknown }[];
  };
  if (
    receipt.version !== 1 ||
    receipt.consumerSha !== sourceSha ||
    receipt.candidateUrl !== candidate.href ||
    receipt.results.length !== receipt.plan.kits.length
  )
    throw new Error('Missing API compatibility receipt');
  for (const [index, kit] of receipt.plan.kits.entries()) {
    const { modes, evidence } = receipt.results[index];
    if (JSON.stringify(modes) !== '["ordinary-probe"]' && JSON.stringify(modes) !== '["ordinary-probe","hot-probe"]') {
      throw new Error('Invalid API compatibility boot modes');
    }
    validateApiKitEvidence(evidence, { ...kit, consumerSha: sourceSha, modes });
  }
  await assertCandidate();
  assertApiKitPlanUnchanged(receipt.plan, await plan());
  console.log(`Rechecked supported Kit registry before API ${sourceSha} promotion`);
} else {
  if (run('git', ['rev-parse', 'HEAD']).toString('utf8').trim() !== sourceSha) throw new Error('API checkout mismatch');
  run('git', ['diff', '--quiet', 'HEAD', '--']);
  await assertCandidate();
  const expected = await plan();
  const staging = await mkdtemp(path.join(tmpdir(), 'api-kits-'));
  try {
    const context = path.join(staging, 'context');
    await mkdir(context);
    const archive = path.join(staging, 'source.tar');
    run('git', ['archive', '--output', archive, sourceSha]);
    run('tar', ['-xf', archive, '-C', context]);
    await writeFile(path.join(context, 'api-ref.txt'), sourceSha + '\n');
    const imageFile = path.join(staging, 'image-id');
    execFileSync(
      'docker',
      [
        'build',
        '-f',
        'infra/api-kit-verifier.Dockerfile',
        '--iidfile',
        imageFile,
        ...(process.env.CODEX_PROXY_CERT ? ['--secret', `id=proxy_ca,src=${process.env.CODEX_PROXY_CERT}`] : []),
        '.',
      ],
      {
        cwd: context,
        stdio: 'inherit',
        timeout: 900_000,
      },
    );
    const image = (await readFile(imageFile, 'utf8')).trim();
    const results = [];
    for (const kit of expected.kits) {
      const files = await apiKitStarter(object(`kits/${kit.engineRef}.tgz`), kit.engineRef, kit.sha256);
      const engine = await fetchGamesRepoArchive({
        repo: process.env.GAMES_REPO ?? 'gamedevpl/www.gamedev.pl-games',
        ref: kit.engineRef,
        token: process.env.GAMES_REPO_TOKEN ?? '',
        include: (name) => name.startsWith('shared/'),
      });
      for (const name of engine.listPaths()) {
        files[name] = Buffer.from((await engine.readBytes(name, kit.engineRef))!).toString('base64');
      }
      const core = await engine.readText('shared/modules/core.ts', kit.engineRef);
      if (!core) throw new Error('Published Kit engine has no core source');
      const modes = ['ordinary-probe', ...(core.includes('function createHotController(') ? ['hot-probe'] : [])];
      const input: ApiKitInput = {
        consumerSha: sourceSha,
        engineRef: kit.engineRef,
        tarballSha256: kit.sha256,
        modes,
        files,
      };
      const inputDir = path.join(staging, 'input');
      const outputDir = path.join(staging, 'output');
      await mkdir(inputDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });
      await chmod(inputDir, 0o755);
      await chmod(outputDir, 0o777);
      await writeFile(path.join(inputDir, 'kit.json'), JSON.stringify(input), { mode: 0o644 });
      await chmod(path.join(inputDir, 'kit.json'), 0o644);
      execFileSync('docker', apiKitContainerArgs(image, inputDir, outputDir), { stdio: 'inherit', timeout: 180_000 });
      const result: unknown = JSON.parse(await readFile(path.join(outputDir, 'receipt.json'), 'utf8'));
      validateApiKitEvidence(result, { ...kit, consumerSha: sourceSha, modes });
      results.push({ modes, evidence: result });
      await rm(outputDir, { recursive: true, force: true });
      console.log(`Verified API ${sourceSha} / Kit ${kit.engineRef}: ${modes.join(', ')}`);
    }
    await assertCandidate();
    assertApiKitPlanUnchanged(expected, await plan());
    await writeFile(
      receiptPath,
      JSON.stringify({
        version: 1,
        consumerSha: sourceSha,
        candidateUrl: candidate.href,
        image,
        plan: expected,
        results,
      }) + '\n',
      { mode: 0o600 },
    );
    console.log(`API compatibility gate passed for ${results.length} supported Kits`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
