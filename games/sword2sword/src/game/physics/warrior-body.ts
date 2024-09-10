import * as planck from 'planck';
import { PhysicsState, WarriorPhysicsBody, World } from './physics-types';
import { Vector2D } from '../game-state/game-state-types';

const HEAD_SIZE = 20;
const NECK_LENGTH = HEAD_SIZE * 0.3;
const TORSO_WIDTH = HEAD_SIZE * 1.5;
const TORSO_HEIGHT = HEAD_SIZE * 2.5;
const ARM_WIDTH = HEAD_SIZE * 0.4;
const ARM_LENGTH = HEAD_SIZE * 1.5;
const HAND_SIZE = HEAD_SIZE * 0.4;
const LEG_LENGTH = HEAD_SIZE * 2;

export function createWarriorBody(world: World, initialPosition: Vector2D): WarriorPhysicsBody {
  const torso = createTorso(world, initialPosition);
  const head = createHead(
    world,
    planck.Vec2(initialPosition.x, initialPosition.y - TORSO_HEIGHT / 2 - HEAD_SIZE / 2 - NECK_LENGTH),
  );
  const neck = createNeck(
    world,
    planck.Vec2(initialPosition.x, initialPosition.y - TORSO_HEIGHT / 2 - NECK_LENGTH / 2),
  );
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
  const sword = createSword(world, planck.Vec2(initialPosition.x + TORSO_WIDTH / 2 + ARM_WIDTH / 2, initialPosition.y));

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
  const neckJoint = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.25 * Math.PI,
        upperAngle: 0.25 * Math.PI,
        enableLimit: true,
      },
      torso,
      neck,
      torso.getWorldPoint(planck.Vec2(0, -TORSO_HEIGHT / 2)),
    ),
  )!;

  const headJoint = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.25 * Math.PI,
        upperAngle: 0.25 * Math.PI,
        enableLimit: true,
      },
      neck,
      head,
      neck.getWorldPoint(planck.Vec2(0, -NECK_LENGTH / 2)),
    ),
  )!;

  const leftShoulder = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.5 * Math.PI,
        upperAngle: 0.5 * Math.PI,
        enableLimit: true,
      },
      torso,
      leftArm.upperArm,
      torso.getWorldPoint(planck.Vec2(-TORSO_WIDTH / 2, -TORSO_HEIGHT / 2 + ARM_WIDTH / 2)),
    ),
  )!;

  const leftElbow = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: 0,
        upperAngle: 0.75 * Math.PI,
        enableLimit: true,
      },
      leftArm.upperArm,
      leftArm.forearm,
      leftArm.upperArm.getWorldPoint(planck.Vec2(0, ARM_LENGTH / 2)),
    ),
  )!;

  const leftWrist = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.5 * Math.PI,
        upperAngle: 0.5 * Math.PI,
        enableLimit: true,
      },
      leftArm.forearm,
      leftArm.hand,
      leftArm.forearm.getWorldPoint(planck.Vec2(0, ARM_LENGTH / 2)),
    ),
  )!;

  const rightShoulder = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.5 * Math.PI,
        upperAngle: 0.5 * Math.PI,
        enableLimit: true,
      },
      torso,
      rightArm.upperArm,
      torso.getWorldPoint(planck.Vec2(TORSO_WIDTH / 2, -TORSO_HEIGHT / 2 + ARM_WIDTH / 2)),
    ),
  )!;

  const rightElbow = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.75 * Math.PI,
        upperAngle: 0,
        enableLimit: true,
      },
      rightArm.upperArm,
      rightArm.forearm,
      rightArm.upperArm.getWorldPoint(planck.Vec2(0, ARM_LENGTH / 2)),
    ),
  )!;

  const rightWrist = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.5 * Math.PI,
        upperAngle: 0.5 * Math.PI,
        enableLimit: true,
      },
      rightArm.forearm,
      rightArm.hand,
      rightArm.forearm.getWorldPoint(planck.Vec2(0, ARM_LENGTH / 2)),
    ),
  )!;

  const leftHip = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.5 * Math.PI,
        upperAngle: 0.5 * Math.PI,
        enableLimit: true,
      },
      torso,
      leftLeg.thigh,
      torso.getWorldPoint(planck.Vec2(-TORSO_WIDTH / 4, TORSO_HEIGHT / 2)),
    ),
  )!;

  const leftKnee = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: 0,
        upperAngle: 0.75 * Math.PI,
        enableLimit: true,
      },
      leftLeg.thigh,
      leftLeg.calf,
      leftLeg.thigh.getWorldPoint(planck.Vec2(0, LEG_LENGTH / 2)),
    ),
  )!;

  const leftAnkle = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.5 * Math.PI,
        upperAngle: 0.5 * Math.PI,
        enableLimit: true,
      },
      leftLeg.calf,
      leftLeg.foot,
      leftLeg.calf.getWorldPoint(planck.Vec2(0, LEG_LENGTH / 2)),
    ),
  )!;

  const rightHip = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.5 * Math.PI,
        upperAngle: 0.5 * Math.PI,
        enableLimit: true,
      },
      torso,
      rightLeg.thigh,
      torso.getWorldPoint(planck.Vec2(TORSO_WIDTH / 4, TORSO_HEIGHT / 2)),
    ),
  )!;

  const rightKnee = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: 0,
        upperAngle: 0.75 * Math.PI,
        enableLimit: true,
      },
      rightLeg.thigh,
      rightLeg.calf,
      rightLeg.thigh.getWorldPoint(planck.Vec2(0, LEG_LENGTH / 2)),
    ),
  )!;

  const rightAnkle = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.5 * Math.PI,
        upperAngle: 0.5 * Math.PI,
        enableLimit: true,
      },
      rightLeg.calf,
      rightLeg.foot,
      rightLeg.calf.getWorldPoint(planck.Vec2(0, LEG_LENGTH / 2)),
    ),
  )!;

  const swordJoint = world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle: -0.75 * Math.PI,
        upperAngle: 0.75 * Math.PI,
        enableLimit: true,
      },
      rightArm.hand,
      sword,
      rightArm.hand.getWorldPoint(planck.Vec2(HAND_SIZE / 2, 0)),
    ),
  )!;

  return {
    neck: neckJoint,
    head: headJoint,
    leftShoulder,
    leftElbow,
    leftWrist,
    rightShoulder,
    rightElbow,
    rightWrist,
    leftHip,
    leftKnee,
    leftAnkle,
    rightHip,
    rightKnee,
    rightAnkle,
    swordJoint,
  };
}

export function updateWarriorPhysics(physicsState: PhysicsState): PhysicsState {
  // TODO: Implement physics update logic
  return physicsState;
}

function createTorso(world: World, position: Vector2D): planck.Body {
  const body = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y),
  });
  body.createFixture(planck.Box(TORSO_WIDTH / 2, TORSO_HEIGHT / 2), {
    density: 1,
    friction: 0.3,
    restitution: 0,
  });
  return body;
}

function createHead(world: World, position: Vector2D): planck.Body {
  const body = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y),
  });
  body.createFixture(planck.Box(HEAD_SIZE / 2, HEAD_SIZE / 2), {
    density: 1,
    friction: 0.3,
    restitution: 0,
  });
  return body;
}

function createNeck(world: World, position: Vector2D): planck.Body {
  const body = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y),
  });
  body.createFixture(planck.Box(HEAD_SIZE / 4, NECK_LENGTH / 2), {
    density: 1,
    friction: 0.3,
    restitution: 0,
  });
  return body;
}

function createArm(
  world: World,
  position: Vector2D,
): { upperArm: planck.Body; forearm: planck.Body; hand: planck.Body } {
  const upperArm = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y),
  });
  upperArm.createFixture(planck.Box(ARM_WIDTH / 2, ARM_LENGTH / 2), {
    density: 1,
    friction: 0.3,
    restitution: 0,
  });

  const forearm = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y + ARM_LENGTH),
  });
  forearm.createFixture(planck.Box(ARM_WIDTH / 2, ARM_LENGTH / 2), {
    density: 1,
    friction: 0.3,
    restitution: 0,
  });

  const hand = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y + ARM_LENGTH * 1.5),
  });
  hand.createFixture(planck.Box(HAND_SIZE / 2, HAND_SIZE / 2), {
    density: 1,
    friction: 0.3,
    restitution: 0,
  });

  return { upperArm, forearm, hand };
}

function createLeg(world: World, position: Vector2D): { thigh: planck.Body; calf: planck.Body; foot: planck.Body } {
  const thigh = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y),
  });
  thigh.createFixture(planck.Box(ARM_WIDTH / 2, LEG_LENGTH / 2), {
    density: 1,
    friction: 0.3,
    restitution: 0,
  });

  const calf = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y + LEG_LENGTH),
  });
  calf.createFixture(planck.Box(ARM_WIDTH / 2, LEG_LENGTH / 2), {
    density: 1,
    friction: 0.3,
    restitution: 0,
  });

  const foot = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(position.x + HAND_SIZE, position.y + LEG_LENGTH * 1.5),
  });
  foot.createFixture(planck.Box(HAND_SIZE * 1.5, HAND_SIZE / 2), {
    density: 1,
    friction: 0.3,
    restitution: 0,
  });

  return { thigh, calf, foot };
}

function createSword(world: World, position: Vector2D): planck.Body {
  const body = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(position.x, position.y),
  });
  body.createFixture(planck.Box(HEAD_SIZE * 0.1, HEAD_SIZE * 2), {
    density: 0.8,
    friction: 0.3,
    restitution: 0,
  });
  return body;
}
