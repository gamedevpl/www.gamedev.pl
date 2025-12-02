import { GameWorldState } from '../world-types';

/**
 * Updates all visual effects in the game state, removing any that have expired.
 * @param gameState The current state of the game world.
 */
export function visualEffectsUpdate(gameState: GameWorldState): void {
  gameState.visualEffects = gameState.visualEffects.filter((effect) => {
    const elapsedTime = gameState.time - effect.startTime;
    return elapsedTime <= effect.duration;
  });
}
