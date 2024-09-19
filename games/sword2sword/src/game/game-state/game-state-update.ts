import { GameState, GameInput, WarriorState, Vector2D, WarriorAction, JointState } from './game-state-types';
import { PhysicsState } from '../physics/physics-types';
import { updatePhysicsState } from '../physics/physics-update';
import { physicsStateToGameState } from '../physics/physics-convert';

export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600;
export const WARRIOR_WIDTH = 60; // Updated based on new proportions (3 * HEAD_SIZE)
export const WARRIOR_HEIGHT = 180; // Updated based on new proportions (9 * HEAD_SIZE)

export function initGameState(): GameState {
  return {
    warriors: [
      createWarrior({ x: ARENA_WIDTH / 3, y: ARENA_HEIGHT - WARRIOR_HEIGHT }),
      createWarrior({ x: (ARENA_WIDTH / 3) * 2, y: ARENA_HEIGHT - WARRIOR_HEIGHT }),
    ],
    time: 0,
  };
}

function createWarrior(position: Vector2D): WarriorState {
  const torsoHeight = 50;
  const neckHeight = 6;
  const headHeight = 20;
  const armLength = 30;
  const legLength = 40;
  const handSize = 8;
  const footSize = 16;

  return {
    position: position,
    torso: { position: { x: position.x, y: position.y }, vertices: [] },
    neck: { position: { x: position.x, y: position.y - torsoHeight / 2 - neckHeight / 2 }, vertices: [] },
    head: { position: { x: position.x, y: position.y - torsoHeight / 2 - neckHeight - headHeight / 2 }, vertices: [] },
    leftUpperArm: { position: { x: position.x - 20, y: position.y - torsoHeight / 4 }, vertices: [] },
    leftForearm: { position: { x: position.x - 25, y: position.y }, vertices: [] },
    leftHand: { position: { x: position.x - 30, y: position.y + armLength / 2 }, vertices: [] },
    rightUpperArm: { position: { x: position.x + 20, y: position.y - torsoHeight / 4 }, vertices: [] },
    rightForearm: { position: { x: position.x + 25, y: position.y }, vertices: [] },
    rightHand: { position: { x: position.x + 30, y: position.y + armLength / 2 }, vertices: [] },
    leftThigh: { position: { x: position.x - 10, y: position.y + torsoHeight / 2 + legLength / 4 }, vertices: [] },
    leftCalf: { position: { x: position.x - 10, y: position.y + torsoHeight / 2 + (legLength * 3) / 4 }, vertices: [] },
    leftFoot: {
      position: { x: position.x - 10, y: position.y + torsoHeight / 2 + legLength + footSize / 2 },
      vertices: [],
    },
    rightThigh: { position: { x: position.x + 10, y: position.y + torsoHeight / 2 + legLength / 4 }, vertices: [] },
    rightCalf: {
      position: { x: position.x + 10, y: position.y + torsoHeight / 2 + (legLength * 3) / 4 },
      vertices: [],
    },
    rightFoot: {
      position: { x: position.x + 10, y: position.y + torsoHeight / 2 + legLength + footSize / 2 },
      vertices: [],
    },
    sword: {
      position: { x: position.x + 40, y: position.y + armLength / 2 + handSize / 2 },
      vertices: [],
      attachedTo: 'rightHand',
    },
    joints: {
      neck: createDefaultJointState(),
      head: createDefaultJointState(),
      leftShoulder: createDefaultJointState(),
      leftElbow: createDefaultJointState(),
      leftWrist: createDefaultJointState(),
      rightShoulder: createDefaultJointState(),
      rightElbow: createDefaultJointState(),
      rightWrist: createDefaultJointState(),
      leftHip: createDefaultJointState(),
      leftKnee: createDefaultJointState(),
      leftAnkle: createDefaultJointState(),
      rightHip: createDefaultJointState(),
      rightKnee: createDefaultJointState(),
      rightAnkle: createDefaultJointState(),
      swordJoint: createDefaultJointState(),
    },
  };
}

function createDefaultJointState(): JointState {
  return {
    angle: 0,
    anchorA: { x: 0, y: 0 },
    anchorB: { x: 0, y: 0 },
  };
}

const UPDATE_ITERATION = 1 / 60; // 60 Hz update rate

export function updateGameState(physicsState: PhysicsState, timeDelta: number, characterInput: GameInput): GameState {
  let updatedGameState = physicsStateToGameState(physicsState);

  while (timeDelta >= UPDATE_ITERATION) {
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

  physicsState.sourceGameState = updatedGameState;

  return updatedGameState;
}

// Helper function to apply warrior actions
export function applyWarriorActions(warriorState: WarriorState, input: GameInput['input']): WarriorState {
  const updatedWarrior = { ...warriorState };
  const movementSpeed = 5;

  if (input.actionEnabled[WarriorAction.MOVE_LEFT]) {
    updatedWarrior.position.x -= movementSpeed;
  } else if (input.actionEnabled[WarriorAction.MOVE_RIGHT]) {
    updatedWarrior.position.x += movementSpeed;
  }

  // Update positions of body parts based on the new warrior position
  const updateBodyPartPosition = (part: keyof WarriorState, offsetX: number, offsetY: number) => {
    if (part !== 'sword' && part !== 'position' && part !== 'joints') {
      updatedWarrior[part].position = {
        x: updatedWarrior.position.x + offsetX,
        y: updatedWarrior.position.y + offsetY,
      };
    }
  };

  updateBodyPartPosition('torso', 0, 0);
  updateBodyPartPosition('neck', 0, -25);
  updateBodyPartPosition('head', 0, -40);
  updateBodyPartPosition('leftUpperArm', -20, -15);
  updateBodyPartPosition('leftForearm', -25, 0);
  updateBodyPartPosition('leftHand', -30, 15);
  updateBodyPartPosition('rightUpperArm', 20, -15);
  updateBodyPartPosition('rightForearm', 25, 0);
  updateBodyPartPosition('rightHand', 30, 15);
  updateBodyPartPosition('leftThigh', -10, 30);
  updateBodyPartPosition('leftCalf', -10, 60);
  updateBodyPartPosition('leftFoot', -10, 85);
  updateBodyPartPosition('rightThigh', 10, 30);
  updateBodyPartPosition('rightCalf', 10, 60);
  updateBodyPartPosition('rightFoot', 10, 85);

  // Update sword position based on which hand it's attached to
  const swordHand = updatedWarrior.sword.attachedTo === 'leftHand' ? updatedWarrior.leftHand : updatedWarrior.rightHand;
  updatedWarrior.sword.position = {
    x: swordHand.position.x + (updatedWarrior.sword.attachedTo === 'leftHand' ? -10 : 10),
    y: swordHand.position.y,
  };

  // Update joint positions based on the new body part positions
  updatedWarrior.joints.neck.anchorA = updatedWarrior.torso.position;
  updatedWarrior.joints.neck.anchorB = updatedWarrior.neck.position;
  updatedWarrior.joints.head.anchorA = updatedWarrior.neck.position;
  updatedWarrior.joints.head.anchorB = updatedWarrior.head.position;
  updatedWarrior.joints.leftShoulder.anchorA = updatedWarrior.torso.position;
  updatedWarrior.joints.leftShoulder.anchorB = updatedWarrior.leftUpperArm.position;
  updatedWarrior.joints.leftElbow.anchorA = updatedWarrior.leftUpperArm.position;
  updatedWarrior.joints.leftElbow.anchorB = updatedWarrior.leftForearm.position;
  updatedWarrior.joints.leftWrist.anchorA = updatedWarrior.leftForearm.position;
  updatedWarrior.joints.leftWrist.anchorB = updatedWarrior.leftHand.position;
  updatedWarrior.joints.rightShoulder.anchorA = updatedWarrior.torso.position;
  updatedWarrior.joints.rightShoulder.anchorB = updatedWarrior.rightUpperArm.position;
  updatedWarrior.joints.rightElbow.anchorA = updatedWarrior.rightUpperArm.position;
  updatedWarrior.joints.rightElbow.anchorB = updatedWarrior.rightForearm.position;
  updatedWarrior.joints.rightWrist.anchorA = updatedWarrior.rightForearm.position;
  updatedWarrior.joints.rightWrist.anchorB = updatedWarrior.rightHand.position;
  updatedWarrior.joints.leftHip.anchorA = updatedWarrior.torso.position;
  updatedWarrior.joints.leftHip.anchorB = updatedWarrior.leftThigh.position;
  updatedWarrior.joints.leftKnee.anchorA = updatedWarrior.leftThigh.position;
  updatedWarrior.joints.leftKnee.anchorB = updatedWarrior.leftCalf.position;
  updatedWarrior.joints.leftAnkle.anchorA = updatedWarrior.leftCalf.position;
  updatedWarrior.joints.leftAnkle.anchorB = updatedWarrior.leftFoot.position;
  updatedWarrior.joints.rightHip.anchorA = updatedWarrior.torso.position;
  updatedWarrior.joints.rightHip.anchorB = updatedWarrior.rightThigh.position;
  updatedWarrior.joints.rightKnee.anchorA = updatedWarrior.rightThigh.position;
  updatedWarrior.joints.rightKnee.anchorB = updatedWarrior.rightCalf.position;
  updatedWarrior.joints.rightAnkle.anchorA = updatedWarrior.rightCalf.position;
  updatedWarrior.joints.rightAnkle.anchorB = updatedWarrior.rightFoot.position;
  updatedWarrior.joints.swordJoint.anchorA = swordHand.position;
  updatedWarrior.joints.swordJoint.anchorB = updatedWarrior.sword.position;

  return updatedWarrior;
}
