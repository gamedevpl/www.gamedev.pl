import * as planck from 'planck';
import { PhysicsState, WarriorPhysicsBody } from './physics-types';
import { GameInput, WarriorAction } from '../game-state/game-state-types';
import { HEAD_SIZE, LEG_LENGTH, NECK_LENGTH, TORSO_HEIGHT } from './warrior-body';

const MOVEMENT_FORCE = 50000; // Adjust this value to control the strength of warrior movement
const VELOCITY_ITERATIONS = 16;
const POSITION_ITERATIONS = 10;

export function updatePhysicsState(physicsState: PhysicsState, timeDelta: number, gameInput: GameInput): PhysicsState {
  // Apply input actions
  applyWarriorActions(physicsState.warriorBodies[gameInput.playerIndex], gameInput, physicsState);

  for (const warriorBody of physicsState.warriorBodies) {
    applyBalanceControl(warriorBody, physicsState);
  }

  // Update physics simulation
  physicsState.world.step(timeDelta, VELOCITY_ITERATIONS, POSITION_ITERATIONS);

  return physicsState;
}

function applyBalanceControl(warriorBody: WarriorPhysicsBody, physicsState: PhysicsState) {
  // const HEAD_TORQUE = 1000; // Adjust this value as needed
  const TORSO_FORCE = 400000; // Adjust this value as needed
  const UPRIGHT_TOLERANCE = 0.001; // Acceptable deviation from upright position

  // Check if head is upright and apply torque
  const headJointAngle = warriorBody.head.getAngle();
  if (Math.abs(headJointAngle) > UPRIGHT_TOLERANCE) {
    // warriorBody.head.setTransform(warriorBody.head.getPosition(), 0);
  }

  // Prevent horizontal movement
  const headVelocity = warriorBody.torso.getLinearVelocity();
  if (Math.abs(headVelocity.x) > 1) {
    warriorBody.head.applyForceToCenter(planck.Vec2(-headVelocity.x * 1000, 0), true);
  }

  const torsoAngle = warriorBody.torso.getAngle();
  if (Math.abs(torsoAngle) > UPRIGHT_TOLERANCE) {
    warriorBody.head.applyForceToCenter(planck.Vec2(-Math.sign(torsoAngle) * 10000, 0), true);
  }

  // Check if head is closer to the ground than length of torso and legs
  const groundDistance = warriorBody.head
    .getPosition()
    .sub(planck.Vec2(warriorBody.head.getPosition().x, physicsState.arenaFixtures[0].getPosition().y))
    .length();
  const MAX_DISTANCE = HEAD_SIZE + NECK_LENGTH + TORSO_HEIGHT + LEG_LENGTH * 2.5;
  if (groundDistance < MAX_DISTANCE) {
    warriorBody.head.applyForceToCenter(planck.Vec2(0, -TORSO_FORCE * Math.sqrt(1 - groundDistance / MAX_DISTANCE)));
  }
}

function applyWarriorActions(warriorBody: WarriorPhysicsBody, gameInput: GameInput, physicsState: PhysicsState) {
  if (!warriorBody) return;

  let forceX = 0;

  if (gameInput.input.actionEnabled[WarriorAction.MOVE_LEFT]) {
    forceX -= MOVEMENT_FORCE;
  }
  if (gameInput.input.actionEnabled[WarriorAction.MOVE_RIGHT]) {
    forceX += MOVEMENT_FORCE;
  }
  if (gameInput.input.actionEnabled[WarriorAction.SWORD_UP]) {
    // warriorBody.rightUpperArm.setTransform(warriorBody.rightUpperArm.getPosition(), -Math.PI);
    // warriorBody.rightForearm.setTransform(warriorBody.rightForearm.getPosition(), -Math.PI);
    // warriorBody.rightHand.setTransform(warriorBody.rightHand.getPosition(), -Math.PI);
    // warriorBody.sword.setTransform(warriorBody.sword.getPosition(), 0);
  }
  if (gameInput.input.actionEnabled[WarriorAction.SWORD_DOWN]) {
    // warriorBody.rightUpperArm.setTransform(warriorBody.rightUpperArm.getPosition(), -Math.PI / 3);
    // warriorBody.rightForearm.setTransform(warriorBody.rightForearm.getPosition(), -Math.PI / 3);
    // warriorBody.rightHand.setTransform(warriorBody.rightHand.getPosition(), -Math.PI / 3);
    // warriorBody.sword.setTransform(warriorBody.sword.getPosition(), (Math.PI / 3) * 2);
  }

  // Apply movement force to the torso
  const force = planck.Vec2(forceX, 0);
  warriorBody.torso.applyForceToCenter(force, true);
}
