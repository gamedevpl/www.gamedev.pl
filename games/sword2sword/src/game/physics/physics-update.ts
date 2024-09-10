import * as planck from 'planck';
import { PhysicsState, WarriorPhysicsBody } from './physics-types';
import { GameInput, WarriorAction } from '../game-state/game-state-types';

const MOVEMENT_FORCE = 500; // Adjust this value to control the strength of warrior movement
const VELOCITY_ITERATIONS = 8;
const POSITION_ITERATIONS = 3;

export function updatePhysicsState(physicsState: PhysicsState, timeDelta: number, gameInput: GameInput): PhysicsState {
  // Apply input actions
  applyWarriorActions(physicsState.warriorBodies[gameInput.playerIndex], gameInput);

  // Update physics simulation
  physicsState.world.step(timeDelta, VELOCITY_ITERATIONS, POSITION_ITERATIONS);

  return physicsState;
}

function applyWarriorActions(warriorBody: WarriorPhysicsBody, gameInput: GameInput) {
  if (!warriorBody) return;

  let forceX = 0;

  if (gameInput.input.actionEnabled[WarriorAction.MOVE_LEFT]) {
    forceX -= MOVEMENT_FORCE;
  }
  if (gameInput.input.actionEnabled[WarriorAction.MOVE_RIGHT]) {
    forceX += MOVEMENT_FORCE;
  }

  // Apply movement force to the torso
  const force = planck.Vec2(forceX, 0);
  warriorBody.torso.applyForceToCenter(force, true);

  // Apply smaller forces to other body parts to simulate coordinated movement
  const limbForce = force.mul(0.2);
  warriorBody.head.applyForceToCenter(limbForce, true);
  warriorBody.neck.applyForceToCenter(limbForce, true);
  warriorBody.leftUpperArm.applyForceToCenter(limbForce, true);
  warriorBody.leftForearm.applyForceToCenter(limbForce, true);
  warriorBody.leftHand.applyForceToCenter(limbForce, true);
  warriorBody.rightUpperArm.applyForceToCenter(limbForce, true);
  warriorBody.rightForearm.applyForceToCenter(limbForce, true);
  warriorBody.rightHand.applyForceToCenter(limbForce, true);
  warriorBody.leftThigh.applyForceToCenter(limbForce, true);
  warriorBody.leftCalf.applyForceToCenter(limbForce, true);
  warriorBody.leftFoot.applyForceToCenter(limbForce, true);
  warriorBody.rightThigh.applyForceToCenter(limbForce, true);
  warriorBody.rightCalf.applyForceToCenter(limbForce, true);
  warriorBody.rightFoot.applyForceToCenter(limbForce, true);

  // Apply a small force to the sword in the direction of movement
  const swordForce = force.mul(0.1);
  warriorBody.sword.applyForceToCenter(swordForce, true);

  // Adjust joint motors to assist in movement
  adjustJointMotors(warriorBody, forceX);
}

function adjustJointMotors(warriorBody: WarriorPhysicsBody, forceX: number) {
  const motorSpeed = forceX * 0.1; // Adjust this multiplier to control joint motor speed

  // Adjust neck joint
  warriorBody.joints.neck.setMotorSpeed(motorSpeed * 0.5);
  warriorBody.joints.neck.enableMotor(true);

  // Adjust shoulder joints
  warriorBody.joints.leftShoulder.setMotorSpeed(-motorSpeed);
  warriorBody.joints.rightShoulder.setMotorSpeed(-motorSpeed);
  warriorBody.joints.leftShoulder.enableMotor(true);
  warriorBody.joints.rightShoulder.enableMotor(true);

  // Adjust elbow joints
  warriorBody.joints.leftElbow.setMotorSpeed(-motorSpeed * 0.5);
  warriorBody.joints.rightElbow.setMotorSpeed(-motorSpeed * 0.5);
  warriorBody.joints.leftElbow.enableMotor(true);
  warriorBody.joints.rightElbow.enableMotor(true);

  // Adjust wrist joints
  warriorBody.joints.leftWrist.setMotorSpeed(-motorSpeed * 0.25);
  warriorBody.joints.rightWrist.setMotorSpeed(-motorSpeed * 0.25);
  warriorBody.joints.leftWrist.enableMotor(true);
  warriorBody.joints.rightWrist.enableMotor(true);

  // Adjust hip joints
  warriorBody.joints.leftHip.setMotorSpeed(motorSpeed);
  warriorBody.joints.rightHip.setMotorSpeed(motorSpeed);
  warriorBody.joints.leftHip.enableMotor(true);
  warriorBody.joints.rightHip.enableMotor(true);

  // Adjust knee joints
  warriorBody.joints.leftKnee.setMotorSpeed(motorSpeed * 0.5);
  warriorBody.joints.rightKnee.setMotorSpeed(motorSpeed * 0.5);
  warriorBody.joints.leftKnee.enableMotor(true);
  warriorBody.joints.rightKnee.enableMotor(true);

  // Adjust ankle joints
  warriorBody.joints.leftAnkle.setMotorSpeed(motorSpeed * 0.25);
  warriorBody.joints.rightAnkle.setMotorSpeed(motorSpeed * 0.25);
  warriorBody.joints.leftAnkle.enableMotor(true);
  warriorBody.joints.rightAnkle.enableMotor(true);

  // Adjust sword joint
  warriorBody.joints.swordJoint.setMotorSpeed(-motorSpeed * 0.5);
  warriorBody.joints.swordJoint.enableMotor(true);
}
