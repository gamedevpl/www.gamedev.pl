/**
 * Game Initialization - Create initial game state
 */

import { GameState, Entity } from './game-types';

/**
 * Initialize the game state with some sample entities
 */
export function initGame(): GameState {
  console.log('Initializing Tribe 2 game...');

  const worldWidth = 2000;
  const worldHeight = 1500;

  // Create some sample entities
  const entities: Entity[] = [];
  const entityCount = 10;

  for (let i = 0; i < entityCount; i++) {
    entities.push({
      id: `entity-${i}`,
      position: {
        x: Math.random() * worldWidth,
        y: Math.random() * worldHeight,
      },
      velocity: {
        x: (Math.random() - 0.5) * 100,
        y: (Math.random() - 0.5) * 100,
      },
      radius: 10 + Math.random() * 20,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
    });
  }

  return {
    time: 0,
    isPaused: false,
    worldWidth,
    worldHeight,
    entities,
    viewportCenter: { x: worldWidth / 2, y: worldHeight / 2 },
    keysPressed: new Set(),
    isMuted: false,
    masterVolume: 0.5,
  };
}
