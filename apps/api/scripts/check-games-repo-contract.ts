/**
 * Cross-repo lockstep check (issue #247).
 *
 * Fetches `tools/lib/assemble.ts` and `tools/validate.ts` from the games repo and
 * asserts they still match `games-repo-contract.ts` on this side:
 *   - GAME_KIT_MODULES order
 *   - MAX_BUNDLE_BYTES === MAX_PROJECT_BYTES
 *   - music injection contract (tracks + __GAME_AUDIO_MUSIC__)
 *
 * Requires GAMES_REPO_TOKEN (contents:read on the games repo). In CI, skip with a
 * warning when the secret is unset so forks / fresh clones still go green; set the
 * secret on gamedevpl/www.gamedev.pl so master and same-repo PRs catch drift.
 *
 * Usage: npm run contract:games-repo -w @gamedevpl/api
 */

import {
  extractGameKitModules,
  extractMaxBundleBytes,
  extractMusicContractSignals,
  GAME_KIT_MODULES,
  MAX_PROJECT_BYTES,
} from '../src/games-repo-contract.js';

const repo = (process.env.GAMES_REPO ?? 'gamedevpl/www.gamedev.pl-games').trim();
const ref = (process.env.GAMES_PUBLISHED_REF ?? 'main').trim();
const token = (process.env.GAMES_REPO_TOKEN ?? '').trim();

async function readGamesRepoFile(path: string): Promise<string> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.raw',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gamedevpl-games-repo-contract-check',
    },
  });
  if (!response.ok) {
    throw new Error(`failed to read ${repo}@${ref}:${path} (${response.status} ${response.statusText})`);
  }
  return response.text();
}

function fail(message: string): never {
  console.error(`games-repo contract: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!token) {
    console.warn(
      'games-repo contract: GAMES_REPO_TOKEN unset — skipping live fetch. ' +
        'Unit tests still guard the website half; set a contents:read PAT on the ' +
        'games repo as the GAMES_REPO_TOKEN Actions secret to enable the cross-repo check.',
    );
    return;
  }

  console.log(`games-repo contract: checking ${repo}@${ref} against apps/api/src/games-repo-contract.ts`);

  const [assembleSource, validateSource] = await Promise.all([
    readGamesRepoFile('tools/lib/assemble.ts'),
    readGamesRepoFile('tools/validate.ts'),
  ]);

  const remoteModules = extractGameKitModules(assembleSource);
  const localModules = [...GAME_KIT_MODULES];
  if (remoteModules.join(',') !== localModules.join(',')) {
    fail(
      `GAME_KIT_MODULES mismatch.\n  games-repo: ${remoteModules.join(', ')}\n  website:    ${localModules.join(', ')}`,
    );
  }
  console.log(`  ✓ GAME_KIT_MODULES (${remoteModules.length} modules)`);

  const remoteBudget = extractMaxBundleBytes(validateSource);
  if (remoteBudget !== MAX_PROJECT_BYTES) {
    fail(`MAX_BUNDLE_BYTES mismatch: games-repo=${remoteBudget} website MAX_PROJECT_BYTES=${MAX_PROJECT_BYTES}`);
  }
  console.log(`  ✓ MAX_BUNDLE_BYTES / MAX_PROJECT_BYTES (${remoteBudget})`);

  const music = extractMusicContractSignals(assembleSource);
  if (!music.injectsMusicName || !music.readsTracksKey || !music.readsMusicJson) {
    fail(
      `music contract mismatch in games-repo assemble.ts: ` +
        `injectsMusicName=${music.injectsMusicName} readsTracksKey=${music.readsTracksKey} readsMusicJson=${music.readsMusicJson}`,
    );
  }
  console.log('  ✓ music contract (__GAME_AUDIO_MUSIC__ + tracks + music.json)');

  console.log('games-repo contract: ok');
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
