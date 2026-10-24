#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { releaseAssets } from './hosting-release.mjs';

try {
  const { hosting } = JSON.parse(await readFile(new URL('./firebase/firebase.json', import.meta.url), 'utf8'));
  const args = process.argv.slice(2);
  const confirming = args.length === 2 && args[0] === '--confirm-promotion' && args[1];
  if (args.length && !(args.length === 1 && args[0] === '--dry-run') && !confirming)
    throw new Error('Usage: node infra/deploy-hosting.mjs [--dry-run | --confirm-promotion VERSION]');
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const result = await releaseAssets({
    site: hosting.site,
    project: process.env.PROJECT_ID || 'gamedevpl',
    token,
    assetDir: fileURLToPath(new URL('../apps/web/dist/assets', import.meta.url)),
    hosting,
    dryRun: args.includes('--dry-run'),
    confirmVersion: confirming ? args[1] : undefined,
  });
  if (process.env.GITHUB_OUTPUT && result.version) {
    await appendFile(process.env.GITHUB_OUTPUT, `version=${result.version}\n`);
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Hosting deployment failed');
  process.exitCode = 1;
}
