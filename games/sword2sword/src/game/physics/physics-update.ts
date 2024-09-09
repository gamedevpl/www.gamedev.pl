import * as planck from 'planck';
import { PhysicsState, WarriorPhysicsBody } from './physics-types';
import { GameInput, WarriorAction } from '../game-state/game-state-types';

const MOVEMENT_FORCE = 500; // Adjust this value to control the strength of warrior movement
const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;

export function updatePhysicsState(physicsState: PhysicsState, timeDelta: number, gameInput: GameInput): PhysicsState {
  // Apply input actions
  applyWarriorActions(physicsState.warriorBodies, gameInput);

  // Update physics simulation
  physicsState.world.step(timeDelta, VELOCITY_ITERATIONS, POSITION_ITERATIONS);

  return physicsState;
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
  const force = planck.Vec2(0, forceX);
  warriorBody.sword.applyLinearImpulse(force, { x: 0, y: 0 }, true);
  //   warriorBody.joint.setMotorSpeed(forceX);
}
