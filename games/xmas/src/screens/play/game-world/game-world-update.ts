import { GameWorldState } from './game-world-types';
import { updateFireballs } from './game-world-update-fireballs';
import { updateSantaCharging, updateSantaEnergy, updateSantaPhysics } from './game-world-update-santas';
import { makeAIDecision } from '../game-ai/ai-santa-decision';
import { AISanta } from '../game-ai/ai-santa-types';
import { updateAISpawner } from '../game-ai/ai-santa-spawner';
import {
  checkFireballSantaCollision,
  handleFireballSantaCollision,
  addFireballFromSanta,
} from './game-world-manipulate';

/**
 * Check and handle collisions between fireballs and all Santas
 */
function processFireballSantaCollisions(state: GameWorldState) {
  // Create a copy of fireballs array as it might be modified during collision handling
  const fireballs = [...state.fireballs];

  // Check collisions with player Santa
  fireballs.forEach((fireball) => {
    if (checkFireballSantaCollision(fireball, state.playerSanta)) {
      handleFireballSantaCollision(state, fireball, state.playerSanta);
    }
  });

  // Check collisions with AI Santas
  state.santas.forEach((santa) => {
    fireballs.forEach((fireball) => {
      if (checkFireballSantaCollision(fireball, santa)) {
        handleFireballSantaCollision(state, fireball, santa);
      }
    });
  });
}

/**
 * Handle AI Santa's fireball launching
 */
function handleAISantaFireball(state: GameWorldState, aiSanta: AISanta) {
  const wasCharging = aiSanta.input.charging;
  const previousChargeStartTime = aiSanta.input.chargeStartTime;

  // Get AI decision which may update charging state
  const decision = makeAIDecision(aiSanta, state, state.time);

  // Update Santa's input and direction based on AI decision
  aiSanta.input = decision.input;
  aiSanta.direction = decision.direction;

  // Check if we just stopped charging (was charging but now isn't)
  if (wasCharging && !decision.input.charging && previousChargeStartTime !== null) {
    // Calculate charge time and create fireball
    const chargeTime = state.time - previousChargeStartTime;
    addFireballFromSanta(state, aiSanta, chargeTime);
  }
}

/**
 * Updates game world state for a single frame
 */
export function updateGameWorld(state: GameWorldState, deltaTime: number) {
  // Update time
  state.time += deltaTime;

  // First update all physics and movement
  updateSantaPhysics(state.playerSanta, deltaTime);
  updateSantaCharging(state);
  updateSantaEnergy(state.playerSanta, deltaTime);

  // Update fireballs and handle their collisions
  updateFireballs(state, deltaTime);

  // Process fireball-Santa collisions
  processFireballSantaCollisions(state);

  // Update AI-controlled Santas
  state.santas.forEach((santa) => {
    if ('ai' in santa) {
      // Handle AI Santa updates including fireball creation
      handleAISantaFireball(state, santa as AISanta);
    }

    // Update AI Santa physics
    updateSantaPhysics(santa, deltaTime);
    updateSantaEnergy(santa, deltaTime);
  });

  // Update AI spawning system
  updateAISpawner(state, state.waveState);

  return state;
}
