/**
 * Cross-repo lockstep check (issue #247) — CI entry point.
 *
 * The check itself lives in `../src/games-repo-contract-check.ts`; this file is the
 * environment, the logging, and the exit code. It asserts the games repo's
 * `tools/lib/assemble.ts`, `tools/validate.ts` and `shared/delivery-contract.json`
 * still match `games-repo-contract.ts` on this side:
 *   - GAME_KIT_MODULES order
 *   - GAME_KIT_VERTICALS entry paths (a module promoted to a vertical keeps its name,
 *     so the order check alone cannot see the source move)
 *   - MAX_BUNDLE_BYTES === MAX_PROJECT_BYTES
 *   - music injection contract (tracks + __GAME_AUDIO_MUSIC__ + readMusicCatalog)
 *   - delivery contract (fixed files and their order, extra-module pattern, caps)
 *
 * Requires GAMES_REPO_TOKEN (contents:read on the games repo). Drift fails. A games
 * repo that cannot be read — no token, exhausted quota, GitHub down — warns and
 * passes, because it is not evidence of drift; set GAMES_CONTRACT_REQUIRE_REMOTE=1
 * to demand the live comparison instead. A half that was tolerated rather than
 * compared (a games tip with no delivery contract yet) is warned about on an
 * otherwise green run.
 *
 * Usage: npm run contract:games-repo -w @gamedevpl/api
 */

import { runGamesRepoContractCheck } from '../src/catalog/games-repo-contract-check.js';

const repo = (process.env.GAMES_REPO ?? 'gamedevpl/www.gamedev.pl-games').trim();
const ref = (process.env.GAMES_PUBLISHED_REF ?? 'main').trim();
const token = (process.env.GAMES_REPO_TOKEN ?? '').trim();
const requireRemote = ['1', 'true', 'yes'].includes(
  (process.env.GAMES_CONTRACT_REQUIRE_REMOTE ?? '').trim().toLowerCase(),
);

/** GitHub Actions renders `::warning::` on the job summary; elsewhere it is a plain line. */
function annotate(title: string, message: string): void {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::warning title=${title}::${message.replace(/\n/g, ' ')}`);
  }
  console.warn(`games-repo contract: ${message}`);
}

async function main(): Promise<void> {
  console.log(`games-repo contract: checking ${repo}@${ref} against apps/api/src/catalog/games-repo-contract.ts`);

  const outcome = await runGamesRepoContractCheck({
    repo,
    ref,
    token,
    log: (message) => console.log(message),
  });

  switch (outcome.kind) {
    case 'ok':
      for (const note of outcome.notes ?? []) {
        annotate('games-repo contract half not compared', note);
      }
      console.log('games-repo contract: ok');
      return;

    case 'drift':
      console.error(`games-repo contract: ${outcome.reason}`);
      process.exit(1);
      return;

    case 'skipped':
    case 'unreachable': {
      const title =
        outcome.kind === 'skipped' ? 'games-repo contract check skipped' : 'games-repo contract check could not run';
      annotate(title, `${outcome.reason}\n  The two halves were NOT compared on this run.`);
      if (requireRemote) {
        console.error('games-repo contract: GAMES_CONTRACT_REQUIRE_REMOTE is set — treating this as a failure.');
        process.exit(1);
      }
      return;
    }
  }
}

main().catch((error: unknown) => {
  console.error(`games-repo contract: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
