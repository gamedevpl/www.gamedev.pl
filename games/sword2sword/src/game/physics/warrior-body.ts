import * as planck from 'planck';
import { WarriorPhysicsBody, World } from './physics-types';
import { Vector2D } from '../game-state/game-state-types';
import { createBodyPart, createRevoluteJoint } from './physics-utils';

const HEAD_SIZE = 20;
const NECK_LENGTH = HEAD_SIZE * 0.3;
const TORSO_WIDTH = HEAD_SIZE * 1.5;
const TORSO_HEIGHT = HEAD_SIZE * 2.5;
const ARM_WIDTH = HEAD_SIZE * 0.4;
const ARM_LENGTH = HEAD_SIZE * 1.5;
const HAND_SIZE = HEAD_SIZE * 0.4;
const LEG_LENGTH = HEAD_SIZE * 2;

export function createWarriorBody(world: World, initialPosition: Vector2D): WarriorPhysicsBody {
  const torso = createBodyPart(world, planck.Box(TORSO_WIDTH / 2, TORSO_HEIGHT / 2), {
    type: 'dynamic',
    position: planck.Vec2(initialPosition.x, initialPosition.y),
  });

  const head = createBodyPart(world, planck.Box(HEAD_SIZE / 2, HEAD_SIZE / 2), {
    type: 'dynamic',
    position: planck.Vec2(initialPosition.x, initialPosition.y - TORSO_HEIGHT / 2 - HEAD_SIZE / 2 - NECK_LENGTH),
  });

  const neck = createBodyPart(world, planck.Box(HEAD_SIZE / 4, NECK_LENGTH / 2), {
    type: 'dynamic',
    position: planck.Vec2(initialPosition.x, initialPosition.y - TORSO_HEIGHT / 2 - NECK_LENGTH / 2),
  });

  const leftArm = createArm(
    world,
    planck.Vec2(initialPosition.x - TORSO_WIDTH / 2 - ARM_WIDTH / 2, initialPosition.y - TORSO_HEIGHT / 4),
  );
  const rightArm = createArm(
    world,
    planck.Vec2(initialPosition.x + TORSO_WIDTH / 2 + ARM_WIDTH / 2, initialPosition.y - TORSO_HEIGHT / 4),
  );
  const leftLeg = createLeg(world, planck.Vec2(initialPosition.x - TORSO_WIDTH / 4, initialPosition.y + TORSO_HEIGHT));
  const rightLeg = createLeg(world, planck.Vec2(initialPosition.x + TORSO_WIDTH / 4, initialPosition.y + TORSO_HEIGHT));

  const sword = createBodyPart(
    world,
    planck.Box(HEAD_SIZE * 0.1, HEAD_SIZE * 2),
    {
      type: 'dynamic',
      position: planck.Vec2(initialPosition.x + TORSO_WIDTH / 2 + ARM_WIDTH / 2, initialPosition.y),
    },
    { density: 0.8 },
  );

  const joints = createJoints(world, torso, head, neck, leftArm, rightArm, leftLeg, rightLeg, sword);

  return {
    torso,
    head,
    neck,
    leftUpperArm: leftArm.upperArm,
    leftForearm: leftArm.forearm,
    leftHand: leftArm.hand,
    rightUpperArm: rightArm.upperArm,
    rightForearm: rightArm.forearm,
    rightHand: rightArm.hand,
    leftThigh: leftLeg.thigh,
    leftCalf: leftLeg.calf,
    leftFoot: leftLeg.foot,
    rightThigh: rightLeg.thigh,
    rightCalf: rightLeg.calf,
    rightFoot: rightLeg.foot,
    sword,
    joints,
  };
}

function createJoints(
  world: World,
  torso: planck.Body,
  head: planck.Body,
  neck: planck.Body,
  leftArm: ReturnType<typeof createArm>,
  rightArm: ReturnType<typeof createArm>,
  leftLeg: ReturnType<typeof createLeg>,
  rightLeg: ReturnType<typeof createLeg>,
  sword: planck.Body,
): WarriorPhysicsBody['joints'] {
  return {
    neck: createRevoluteJoint(
      world,
      torso,
      neck,
      torso.getWorldPoint(planck.Vec2(0, -TORSO_HEIGHT / 2)),
      -0.25 * Math.PI,
      0.25 * Math.PI,
    ),
    head: createRevoluteJoint(
      world,
      neck,
      head,
      neck.getWorldPoint(planck.Vec2(0, -NECK_LENGTH / 2)),
      -0.25 * Math.PI,
      0.25 * Math.PI,
    ),
    leftShoulder: createRevoluteJoint(
      world,
      torso,
      leftArm.upperArm,
      torso.getWorldPoint(planck.Vec2(-TORSO_WIDTH / 2, -TORSO_HEIGHT / 2 + ARM_WIDTH / 2)),
      -0.5 * Math.PI,
      0.5 * Math.PI,
    ),
    leftElbow: createRevoluteJoint(
      world,
      leftArm.upperArm,
      leftArm.forearm,
      leftArm.upperArm.getWorldPoint(planck.Vec2(0, ARM_LENGTH / 2)),
      0,
      0.75 * Math.PI,
    ),
    leftWrist: createRevoluteJoint(
      world,
      leftArm.forearm,
      leftArm.hand,
      leftArm.forearm.getWorldPoint(planck.Vec2(0, ARM_LENGTH / 2)),
      -0.5 * Math.PI,
      0.5 * Math.PI,
    ),
    rightShoulder: createRevoluteJoint(
      world,
      torso,
      rightArm.upperArm,
      torso.getWorldPoint(planck.Vec2(TORSO_WIDTH / 2, -TORSO_HEIGHT / 2 + ARM_WIDTH / 2)),
      -0.5 * Math.PI,
      0.5 * Math.PI,
    ),
    rightElbow: createRevoluteJoint(
      world,
      rightArm.upperArm,
      rightArm.forearm,
      rightArm.upperArm.getWorldPoint(planck.Vec2(0, ARM_LENGTH / 2)),
      -0.75 * Math.PI,
      0,
    ),
    rightWrist: createRevoluteJoint(
      world,
      rightArm.forearm,
      rightArm.hand,
      rightArm.forearm.getWorldPoint(planck.Vec2(0, ARM_LENGTH / 2)),
      -0.5 * Math.PI,
      0.5 * Math.PI,
    ),
    leftHip: createRevoluteJoint(
      world,
      torso,
      leftLeg.thigh,
      torso.getWorldPoint(planck.Vec2(-TORSO_WIDTH / 4, TORSO_HEIGHT / 2)),
      -0.5 * Math.PI,
      0.5 * Math.PI,
    ),
    leftKnee: createRevoluteJoint(
      world,
      leftLeg.thigh,
      leftLeg.calf,
      leftLeg.thigh.getWorldPoint(planck.Vec2(0, LEG_LENGTH / 2)),
      0,
      0.75 * Math.PI,
    ),
    leftAnkle: createRevoluteJoint(
      world,
      leftLeg.calf,
      leftLeg.foot,
      leftLeg.calf.getWorldPoint(planck.Vec2(0, LEG_LENGTH / 2)),
      -0.5 * Math.PI,
      0.5 * Math.PI,
    ),
    rightHip: createRevoluteJoint(
      world,
      torso,
      rightLeg.thigh,
      torso.getWorldPoint(planck.Vec2(TORSO_WIDTH / 4, TORSO_HEIGHT / 2)),
      -0.5 * Math.PI,
      0.5 * Math.PI,
    ),
    rightKnee: createRevoluteJoint(
      world,
      rightLeg.thigh,
      rightLeg.calf,
      rightLeg.thigh.getWorldPoint(planck.Vec2(0, LEG_LENGTH / 2)),
      0,
      0.75 * Math.PI,
    ),
    rightAnkle: createRevoluteJoint(
      world,
      rightLeg.calf,
      rightLeg.foot,
      rightLeg.calf.getWorldPoint(planck.Vec2(0, LEG_LENGTH / 2)),
      -0.5 * Math.PI,
      0.5 * Math.PI,
    ),
    swordJoint: createRevoluteJoint(
      world,
      rightArm.hand,
      sword,
      rightArm.hand.getWorldPoint(planck.Vec2(HAND_SIZE / 2, 0)),
      -0.75 * Math.PI,
      0.75 * Math.PI,
    ),
  };
}

function createArm(
  world: World,
  position: Vector2D,
): { upperArm: planck.Body; forearm: planck.Body; hand: planck.Body } {
  const upperArm = createBodyPart(world, planck.Box(ARM_WIDTH / 2, ARM_LENGTH / 2), {
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y),
  });

  const forearm = createBodyPart(world, planck.Box(ARM_WIDTH / 2, ARM_LENGTH / 2), {
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y + ARM_LENGTH),
  });

  const hand = createBodyPart(world, planck.Box(HAND_SIZE / 2, HAND_SIZE / 2), {
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y + ARM_LENGTH * 1.5),
  });

  return { upperArm, forearm, hand };
}

function createLeg(world: World, position: Vector2D): { thigh: planck.Body; calf: planck.Body; foot: planck.Body } {
  const thigh = createBodyPart(world, planck.Box(ARM_WIDTH / 2, LEG_LENGTH / 2), {
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y),
  });

  const calf = createBodyPart(world, planck.Box(ARM_WIDTH / 2, LEG_LENGTH / 2), {
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y + LEG_LENGTH),
  });

  const foot = createBodyPart(world, planck.Box(HAND_SIZE * 1.5, HAND_SIZE / 2), {
    type: 'dynamic',
    position: planck.Vec2(position.x + HAND_SIZE, position.y + LEG_LENGTH * 1.5),
  });

  return { thigh, calf, foot };
}
