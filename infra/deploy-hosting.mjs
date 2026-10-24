#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { releaseAssets } from './hosting-release.mjs';

try {
  const { hosting } = JSON.parse(await readFile(new URL('./firebase/firebase.json', import.meta.url), 'utf8'));
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--dry-run')) throw new Error('Usage: node infra/deploy-hosting.mjs [--dry-run]');
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
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Hosting deployment failed');
  process.exitCode = 1;
}
