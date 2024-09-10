import * as planck from 'planck';
import { GameState } from '../game-state/game-state-types';

export type Vector2D = planck.Vec2;

export type Body = planck.Body;

export type Joint = planck.Joint;

export type World = planck.World;

export type PhysicsState = {
  world: World;
  sourceGameState: GameState;
  warriorBodies: WarriorPhysicsBody[];
  arenaFixtures: Body[];
};

export type WarriorPhysicsBody = {
  torso: Body;
  neck: Body;
  head: Body;
  leftUpperArm: Body;
  leftForearm: Body;
  leftHand: Body;
  rightUpperArm: Body;
  rightForearm: Body;
  rightHand: Body;
  leftThigh: Body;
  leftCalf: Body;
  leftFoot: Body;
  rightThigh: Body;
  rightCalf: Body;
  rightFoot: Body;
  sword: Body;
  joints: {
    head: planck.RevoluteJoint;
    neck: planck.RevoluteJoint;
    leftShoulder: planck.RevoluteJoint;
    rightShoulder: planck.RevoluteJoint;
    leftElbow: planck.RevoluteJoint;
    rightElbow: planck.RevoluteJoint;
    leftWrist: planck.RevoluteJoint;
    rightWrist: planck.RevoluteJoint;
    leftHip: planck.RevoluteJoint;
    rightHip: planck.RevoluteJoint;
    leftKnee: planck.RevoluteJoint;
    rightKnee: planck.RevoluteJoint;
    leftAnkle: planck.RevoluteJoint;
    rightAnkle: planck.RevoluteJoint;
    swordJoint: planck.RevoluteJoint;
  };
};

export type PhysicsConfig = {
  arenaWidth: number;
  arenaHeight: number;
  gravity: Vector2D;
  warriorDensity: number;
  warriorFriction: number;
  warriorRestitution: number;
  swordDensity: number;
};

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  arenaWidth: 800,
  arenaHeight: 600,
  gravity: planck.Vec2(0, 10),
  warriorDensity: 1,
  warriorFriction: 0.3,
  warriorRestitution: 0.2,
  swordDensity: 0.8,
};

export function createBodyPart(world: World, vertices: planck.Vec2[], options: planck.BodyDef): Body {
  const body = world.createBody(options);
  body.createFixture({
    shape: planck.Polygon(vertices),
    density: options.type === 'dynamic' ? 1 : 0,
    friction: 0.3,
    restitution: 0.2,
  });
  return body;
}
