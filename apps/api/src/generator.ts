import { MockGameGenerator, type GameGenerator } from '@gamedevpl/game-generator';

/**
 * Selects the game generator. Only the offline mock exists now: games are no
 * longer generated on demand by this app. They live in the games repo and are
 * maintained there by coding agents — see docs/games-repo.md.
 */
export function createGenerator(provider = process.env.LLM_PROVIDER ?? 'mock'): GameGenerator {
  if (provider !== 'mock') {
    throw new Error(`Unknown LLM_PROVIDER "${provider}". Only "mock" is supported.`);
  }
  return new MockGameGenerator();
}
