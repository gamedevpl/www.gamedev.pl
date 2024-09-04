import * as RAPIER from '@dimforge/rapier2d';
import { PhysicsState } from './physics-types';
import { GameState } from '../game-state/game-state-types';

export function gameStateToPhysicsState(gameState: GameState): PhysicsState {
  // create physics state based on the current game state
  let gravity = new RAPIER.Vector2(0.0, -9.81);
  let world = new RAPIER.World(gravity);

  return {
    world,
    sourceGameState: gameState,
  };
}

export function physicsStateToGameState(physicsState: PhysicsState): GameState {
  // convert physics stte to game state
  return physicsState.sourceGameState;
}
