import * as RAPIER from '@dimforge/rapier2d';
import { PhysicsState } from './physics-types';
import { GameInput, WarriorAction } from '../game-state/game-state-types';

const MOVEMENT_FORCE = 5000; // Adjust this value to control the strength of warrior movement

export function updatePhysicsState(physicsState: PhysicsState, timeDelta: number, gameInput: GameInput): PhysicsState {
  // Apply input actions
  applyWarriorActions(physicsState, gameInput);

  // Perform step
  physicsState.world.timestep = timeDelta;
  physicsState.world.step();

  //   // Apply additional physics logic
  //   handleCollisionsAndPushing(physicsState);

  return physicsState;
}

function applyWarriorActions(physicsState: PhysicsState, gameInput: GameInput) {
  const warriorBody = physicsState.warriorBodies[gameInput.playerIndex];
  if (!warriorBody) return;

  let forceX = 0;

  if (gameInput.input.actionEnabled[WarriorAction.MOVE_LEFT]) {
    forceX -= MOVEMENT_FORCE;
  }
  if (gameInput.input.actionEnabled[WarriorAction.MOVE_RIGHT]) {
    forceX += MOVEMENT_FORCE;
  }

  warriorBody.applyImpulse(new RAPIER.Vector2(forceX, 0), true);
}
