import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseKitRegistry } from '../src/platform/kit-window.js';
import { parseKitSidecar } from '../src/platform/kit-registry.js';
import { selectKitsToPrune, type KitCandidate } from '../src/platform/api-kit-retention.js';

function readFlag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const bucket = (readFlag('bucket') ?? process.env.GAMES_STORE_BUCKET ?? 'gamedevpl-games-store').trim();
const retentionDaysStr = readFlag('retention-days');
const retentionDays = retentionDaysStr ? parseInt(retentionDaysStr, 10) : 14;
const execute = process.argv.includes('--execute');

if (!/^[a-z0-9][a-z0-9._-]+$/.test(bucket)) {
  throw new Error(`Invalid bucket name: ${bucket}`);
}

async function main() {
  console.log(
    `==> Scanning gs://${bucket}/kits/*.json for pruning (retention: ${retentionDays} days, execute: ${execute})`,
  );
  const staging = await mkdtemp(path.join(tmpdir(), 'api-kit-prune-'));
  try {
    execFileSync('gcloud', ['storage', 'cp', `gs://${bucket}/kits/*.json`, staging], {
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const currentRaw = await readFile(path.join(staging, 'current.json'), 'utf8');
    const registry = parseKitRegistry(currentRaw);

    const files = await readdir(staging);
    const sidecars: Record<string, KitCandidate> = {};
    for (const file of files) {
      const match = /^([a-f0-9]{40})\.json$/.exec(file);
      if (match) {
        const engineRef = match[1];
        const raw = await readFile(path.join(staging, file), 'utf8');
        try {
          const parsed = parseKitSidecar(raw);
          sidecars[engineRef] = {
            engineRef,
            version: parsed.version,
            packedAt: parsed.packedAt,
          };
        } catch {
          // Keep corrupt/unparseable sidecars safe
          sidecars[engineRef] = { engineRef };
        }
      }
    }

    const { keep, prune } = selectKitsToPrune({
      current: registry.current,
      previous: registry.previous,
      sidecars,
      retentionDays,
    });

    console.log(`Found ${Object.keys(sidecars).length} published Kits:`);
    console.log(`  Keeping: ${keep.size} Kits (active window, < ${retentionDays}d recent, and version archetypes)`);
    console.log(`  To prune: ${prune.length} obsolete Kits`);

    if (prune.length === 0) {
      console.log('Nothing to prune.');
      return;
    }

    // Build list of all objects to remove
    const urlsToDelete: string[] = [];
    for (const ref of prune) {
      urlsToDelete.push(`gs://${bucket}/kits/${ref}.tgz`);
      urlsToDelete.push(`gs://${bucket}/kits/${ref}.json`);
      urlsToDelete.push(`gs://${bucket}/kits/${ref}.digest.md`);
      urlsToDelete.push(`gs://${bucket}/workspaces/${ref}.tgz`);
      urlsToDelete.push(`gs://${bucket}/workspaces/${ref}.json`);
    }

    console.log(`Total candidate object paths to delete: ${urlsToDelete.length}`);

    if (!execute) {
      console.log('\n[DRY RUN] No objects were deleted. Run with --execute to perform deletion.');
      return;
    }

    console.log(`\n==> Deleting ${urlsToDelete.length} objects from gs://${bucket}...`);
    const input = urlsToDelete.join('\n') + '\n';
    try {
      execFileSync('gcloud', ['storage', 'rm', '--continue-on-error', '-I'], {
        input,
        timeout: 300_000,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
    } catch {
      // Status 1 indicates non-existent objects, which is expected.
      console.warn('Note: some candidate paths did not exist, continue-on-error completed deletion.');
    }
    console.log(`\n✔ Successfully pruned ${prune.length} obsolete Kits.`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('prune-kits failed:', err);
  process.exit(1);
});
