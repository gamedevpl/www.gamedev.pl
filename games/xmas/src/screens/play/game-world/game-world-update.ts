import { GameWorldState } from './game-world-types';
import { updateFireballs } from './game-world-update-fireballs';
import { updateSantaCharging, updateSantaEnergy, updateSantaPhysics } from './game-world-update-santas';

/**
 * Updates game world state for a single frame
 */
export function updateGameWorld(state: GameWorldState, deltaTime: number) {
  // Update time
  state.time += deltaTime;

  // Update Santa physics and energy
  updateSantaPhysics(state.playerSanta, deltaTime);
  updateSantaCharging(state);
  updateSantaEnergy(state.playerSanta, deltaTime);

  // Update other game entities
  updateFireballs(state, deltaTime);

  // Update AI-controlled Santas
  state.santas.forEach((santa) => {
    updateSantaPhysics(santa, deltaTime);
    updateSantaEnergy(santa, deltaTime);
  });

  return state;
}
