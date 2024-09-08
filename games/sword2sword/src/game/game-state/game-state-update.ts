import { GameState, GameInput, WarriorState, Vector2D, WarriorAction } from './game-state-types';
import { PhysicsState } from '../physics/physics-types';
import { updatePhysicsState } from '../physics/physics-update';
import { physicsStateToGameState } from '../physics/physics-convert';

export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600;
export const WARRIOR_WIDTH = 40;
export const WARRIOR_HEIGHT = 100;

export function initGameState(): GameState {
  return {
    warriors: [createWarrior({ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 })],
    time: 0,
  };
}

function createWarrior(position: Vector2D): WarriorState {
  return {
    position: position,
    vertices: [],
  };
}

const UPDATE_ITERATION = 0.016;

export function updateGameState(physicsState: PhysicsState, timeDelta: number, characterInput: GameInput): GameState {
  let updatedGameState = physicsStateToGameState(physicsState);

  while (timeDelta > 0) {
    const iterationTimeDelta = Math.min(timeDelta, UPDATE_ITERATION);
    updatedGameState = updateGameStateIteration(physicsState, iterationTimeDelta, characterInput);
    timeDelta -= UPDATE_ITERATION;
  }

  return updatedGameState;
}

function updateGameStateIteration(physicsState: PhysicsState, timeDelta: number, characterInput: GameInput): GameState {
  // Update physics state
  const updatedPhysicsState = updatePhysicsState(physicsState, timeDelta, characterInput);

  // Convert updated physics state back to game state
  const updatedGameState = physicsStateToGameState(updatedPhysicsState);

  // Update time
  updatedGameState.time += timeDelta;

  return updatedGameState;
}

// Helper function to apply warrior actions
export function applyWarriorActions(warriorState: WarriorState, input: GameInput['input']): WarriorState {
  const updatedWarrior = { ...warriorState };

  if (input.actionEnabled[WarriorAction.MOVE_LEFT]) {
    updatedWarrior.position.x += -5;
  } else if (input.actionEnabled[WarriorAction.MOVE_RIGHT]) {
    updatedWarrior.position.x += 5;
  }

  return updatedWarrior;
}
