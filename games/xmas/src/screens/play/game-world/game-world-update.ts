import { GameOverStats, GameWorldState } from './game-world-types';
import { updateFireballs } from './game-world-update-fireballs';
import { updateSantaCharging, updateSantaEnergy, updateSantaPhysics } from './game-world-update-santas';
import { makeAIDecision } from '../game-ai/ai-santa-decision';
import { AISanta } from '../game-ai/ai-santa-types';
import { updateAISpawner } from '../game-ai/ai-santa-spawner';
import { shouldSpawnGift, spawnGift, updateGiftSpawnTiming, tryCollectNearbyGifts } from './game-world-gift-manipulate';
import { addFireballFromSanta } from './game-world-manipulate';
import { updateGifts } from './game-world-update-gifts';
import { devConfig } from '../dev/dev-config';
import { checkFireballSantaCollision, handleFireballSantaCollision } from './game-world-collisions';

/**
 * Check if a Santa should be eliminated based on their energy
 */
function checkSantaElimination(state: GameWorldState, currentTime: number) {
  state.santas.forEach((santa) => {
    // Check if Santa should be eliminated (energy is 0 and not already eliminated)
    if (santa.energy <= 0 && !santa.isEliminated) {
      santa.isEliminated = true;
      santa.eliminatedAt = currentTime;

      // Increment eliminated count for stats
      state.santasEliminatedCount++;
    }
  });
}

/**
 * Remove eliminated AI Santas from the game world
 */
function removeEliminatedAISantas(state: GameWorldState) {
  state.santas = state.santas.filter((santa) => santa === state.playerSanta || !santa.isEliminated);
}

/**
 * Check and handle collisions between fireballs and all Santas
 */
function processFireballSantaCollisions(state: GameWorldState) {
  // Create a copy of fireballs array as it might be modified during collision handling
  const fireballs = [...state.fireballs];

  // Check collisions with player Santa
  fireballs.forEach((fireball) => {
    if (!state.playerSanta.isEliminated && checkFireballSantaCollision(fireball, state.playerSanta)) {
      handleFireballSantaCollision(fireball, state.playerSanta);
    }
  });

  // Check collisions with AI Santas only if AI is enabled
  if (devConfig.enableAISantas) {
    state.santas.forEach((santa) => {
      if (santa === state.playerSanta || santa.isEliminated) return; // Skip player Santa and eliminated Santas

      fireballs.forEach((fireball) => {
        if (checkFireballSantaCollision(fireball, santa)) {
          handleFireballSantaCollision(fireball, santa);
        }
      });
    });
  }
}

/**
 * Handle AI Santa's fireball launching
 */
function handleAISantaFireball(state: GameWorldState, aiSanta: AISanta) {
  // Skip if Santa is eliminated
  if (aiSanta.isEliminated) return;

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

  // Skip updates if game is over
  if (state.gameOver) {
    return state;
  }

  if (state.playerSanta.isEliminated && !state.gameOver) {
    // If player Santa is eliminated, trigger game over
    const gameOverStats: GameOverStats = {
      timeSurvived: state.time - state.waveState.startTime!,
      giftsCollected: state.giftsCollectedCount,
      santasEliminated: state.santasEliminatedCount,
      finalWave: state.waveState.currentWave,
    };
    state.gameOver = true;
    state.gameOverStats = gameOverStats;
  }

  // Update gift spawning system
  if (shouldSpawnGift(state)) {
    spawnGift(state);
  }
  updateGiftSpawnTiming(state);

  // First update all physics and movement
  if (!state.playerSanta.isEliminated) {
    updateSantaPhysics(state.playerSanta, deltaTime);
    updateSantaCharging(state);
    updateSantaEnergy(state.playerSanta, deltaTime, state);

    // Check for automatic gift collection for player Santa
    tryCollectNearbyGifts(state, state.playerSanta);
  }

  // Update fireballs and handle their collisions
  updateFireballs(state, deltaTime);

  // Process fireball-Santa collisions
  processFireballSantaCollisions(state);

  // Check for Santa eliminations
  checkSantaElimination(state, state.time);

  // Update AI-controlled Santas only if enabled
  if (devConfig.enableAISantas) {
    state.santas.forEach((santa) => {
      if (santa === state.playerSanta || santa.isEliminated) return; // Skip player Santa and eliminated Santas

      if ('ai' in santa) {
        // Handle AI Santa updates including fireball creation
        handleAISantaFireball(state, santa as AISanta);
      }

      // Update AI Santa physics
      updateSantaPhysics(santa, deltaTime);
      updateSantaEnergy(santa, deltaTime, state);

      // Check for automatic gift collection for AI Santas
      tryCollectNearbyGifts(state, santa);
    });

    // Update AI spawning system only if AI is enabled
    updateAISpawner(state, state.waveState);

    // Remove eliminated AI Santas
    removeEliminatedAISantas(state);
  } else {
    // If AI is disabled, ensure only player Santa remains
    state.santas = state.santas.filter((santa) => santa === state.playerSanta);
  }

  // Update gifts system
  updateGifts(state);

  return state;
}
