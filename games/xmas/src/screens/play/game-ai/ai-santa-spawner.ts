import { GameWorldState } from '../game-world/game-world-types';
import { createSanta } from '../game-world/game-world-manipulate';
import { AI_CONFIG, AISanta, WAVE_STATUS, WaveState } from './ai-santa-types';
import { initializeAIState } from './ai-santa-decision';
import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from '../game-world/game-world-consts';
import { devConfig } from '../dev/dev-config';

/**
 * Calculate a safe spawn position for AI Santa
 */
function calculateSpawnPosition(gameState: GameWorldState): { x: number; y: number } {
  const margin = AI_CONFIG.SPAWN_MARGIN;
  const minX = margin;
  const maxX = GAME_WORLD_WIDTH - margin;
  const minY = AI_CONFIG.SPAWN_MARGIN;
  const maxY = GAME_WORLD_HEIGHT - margin;

  // Try to spawn away from the player
  const playerX = gameState.playerSanta.x;

  // Choose the side opposite to the player
  const x =
    playerX < GAME_WORLD_WIDTH / 2
      ? Math.random() * (maxX - GAME_WORLD_WIDTH / 2) + GAME_WORLD_WIDTH / 2
      : Math.random() * (GAME_WORLD_WIDTH / 2 - minX) + minX;

  // Random Y position within safe bounds
  const y = Math.random() * (maxY - minY) + minY;

  return { x, y };
}

/**
 * Create a new AI Santa with appropriate properties
 */
function createAISanta(gameState: GameWorldState): AISanta {
  const { x, y } = calculateSpawnPosition(gameState);
  const id = `ai_santa_${gameState.time}_${Math.random().toString(36).substr(2, 9)}`;

  // Create base Santa instance with dedMoroz theme
  const santa = createSanta(id, x, y, false) as AISanta;
  santa.colorTheme = 'dedMoroz'; // Set the Ded Moroz theme for AI Santas

  // Initialize AI state
  initializeAIState(santa);

  // Scale energy regeneration based on wave
  santa.energyRegenPaused = false;

  return santa;
}

/**
 * Initialize wave state
 */
export function initializeWaveState(): WaveState {
  return {
    currentWave: 0,
    santasRemaining: 0,
    nextSpawnTime: null,
    status: WAVE_STATUS.PREPARING, // or appropriate default value
    difficultyMultiplier: 1, // or appropriate default value
  };
}

/**
 * Check if all AI Santas have been eliminated
 */
function areAllSantasEliminated(gameState: GameWorldState): boolean {
  return gameState.santas.length === 1;
}

/**
 * Progress to the next wave
 */
function progressToNextWave(waveState: WaveState, currentTime: number): void {
  waveState.currentWave++;
  waveState.santasRemaining = waveState.currentWave;
  waveState.nextSpawnTime = currentTime + 3000; // 3 second delay before next wave
}

/**
 * Spawn AI Santas for the current wave
 */
function spawnWaveSantas(gameState: GameWorldState, waveState: WaveState): void {
  const santasToSpawn = waveState.santasRemaining;

  for (let i = 0; i < santasToSpawn; i++) {
    const aiSanta = createAISanta(gameState);
    gameState.santas.push(aiSanta);
  }

  waveState.nextSpawnTime = null;
}

/**
 * Main update function for AI Santa spawning system
 */
export function updateAISpawner(gameState: GameWorldState, waveState: WaveState): void {
  if (!devConfig.enableAISantas) {
    // Reset wave state when AI is disabled
    waveState.currentWave = 0;
    return;
  }

  // Check if current wave is completed
  if (areAllSantasEliminated(gameState)) {
    if (waveState.nextSpawnTime === null) {
      // Progress to next wave
      progressToNextWave(waveState, gameState.time);
    } else if (gameState.time >= waveState.nextSpawnTime) {
      // Spawn new wave of Santas
      spawnWaveSantas(gameState, waveState);
    }
  }
}
