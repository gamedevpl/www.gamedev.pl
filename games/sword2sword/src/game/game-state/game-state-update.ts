import { GameState, GameInput } from './game-state-types';
import { updatePhysicsState } from '../physics/physics-update';
import { gameStateToPhysicsState, physicsStateToGameState } from '../physics/physics-convert';

export function initGameState(): GameState {
  return {
    warriors: [
      {
        position: 100, // Starting position for the first warrior
        width: 50, // Width of the warrior rectangle
        height: 100, // Height of the warrior rectangle
        velocity: { x: 0, y: 0 },
      },
      {
        position: 300, // Starting position for the second warrior
        width: 50, // Width of the warrior rectangle
        height: 100, // Height of the warrior rectangle
        velocity: { x: 0, y: 0 },
      },
    ],
    time: 0,
  };
}

export function updateGameState(gameState: GameState, timeDelta: number, characterInput: GameInput): GameState {
  // Convert game state to physics state
  const physicsState = gameStateToPhysicsState(gameState);

  // Update physics state
  const updatedPhysicsState = updatePhysicsState(physicsState, timeDelta, characterInput);

  // Convert updated physics state back to game state
  const updatedGameState = physicsStateToGameState(updatedPhysicsState);

  // Update time
  updatedGameState.time += timeDelta;

  return updatedGameState;
}
