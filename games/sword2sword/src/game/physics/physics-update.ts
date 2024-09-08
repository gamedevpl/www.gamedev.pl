import * as Matter from 'matter-js';
import { PhysicsState, WarriorPhysicsBody } from './physics-types';
import { GameInput, WarriorAction } from '../game-state/game-state-types';

const MOVEMENT_FORCE = 0.05; // Adjust this value to control the strength of warrior movement

export function updatePhysicsState(physicsState: PhysicsState, timeDelta: number, gameInput: GameInput): PhysicsState {
  // Apply input actions
  applyWarriorActions(physicsState.warriorBodies, gameInput);

  // Update physics simulation
  Matter.Engine.update(physicsState.engine, timeDelta * 1000);

  // Wrap the updated Matter.js engine back to our custom PhysicsState
  return {
    ...physicsState,
  };
}

function applyWarriorActions(warriorBodies: WarriorPhysicsBody[], gameInput: GameInput) {
  const warriorBody = warriorBodies[gameInput.playerIndex];
  if (!warriorBody) return;

  let forceX = 0;

  if (gameInput.input.actionEnabled[WarriorAction.MOVE_LEFT]) {
    forceX -= MOVEMENT_FORCE;
  }
  if (gameInput.input.actionEnabled[WarriorAction.MOVE_RIGHT]) {
    forceX += MOVEMENT_FORCE;
  }

  // Apply movement force to the body
  Matter.Body.applyForce(warriorBody.body, warriorBody.body.position, { x: forceX, y: 0 });
}

// Function to update joint constraints (if needed in the future)
export function updateJointConstraints(_warriorBody: WarriorPhysicsBody) {
  // This function is left empty for now, as we don't have complex joints in the simplified version
  // You can implement it later if needed
}
