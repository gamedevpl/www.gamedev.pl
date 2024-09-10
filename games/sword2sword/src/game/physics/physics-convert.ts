import * as planck from 'planck';
import { PhysicsState, PhysicsConfig, DEFAULT_PHYSICS_CONFIG, Body, World } from './physics-types';
import { GameState, WarriorState, Vector2D, JointState } from '../game-state/game-state-types';
import { createWarriorBody } from './warrior-body';

export function initPhysicsState(gameState: GameState, config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG): PhysicsState {
  const world = new planck.World(config.gravity);

  // Create arena barriers
  const arenaFixtures = createArenaBarriers(world, config);

  // Create warrior bodies
  const warriorBodies = gameState.warriors.map(warrior => createWarriorBody(world, warrior.position));

  return {
    world,
    sourceGameState: gameState,
    warriorBodies,
    arenaFixtures,
  };
}

function createArenaBarriers(world: World, config: PhysicsConfig): Body[] {
  const groundBody = world.createBody({
    type: 'static',
    position: planck.Vec2(config.arenaWidth / 2, config.arenaHeight - 25),
  });

  const groundShape = planck.Box(config.arenaWidth / 2, 25);
  groundBody.createFixture({
    shape: groundShape,
    friction: 0.3,
  });

  return [groundBody];
}

export function physicsStateToGameState(physicsState: PhysicsState): GameState {
  const updatedWarriors = physicsState.warriorBodies.map((warriorBody, index) => {
    const originalWarrior = physicsState.sourceGameState.warriors[index];

    const newWarrior: WarriorState = {
      position: getBodyPartState(warriorBody.torso).position,
      torso: getBodyPartState(warriorBody.torso),
      neck: getBodyPartState(warriorBody.neck),
      head: getBodyPartState(warriorBody.head),
      leftUpperArm: getBodyPartState(warriorBody.leftUpperArm),
      leftForearm: getBodyPartState(warriorBody.leftForearm),
      leftHand: getBodyPartState(warriorBody.leftHand),
      rightUpperArm: getBodyPartState(warriorBody.rightUpperArm),
      rightForearm: getBodyPartState(warriorBody.rightForearm),
      rightHand: getBodyPartState(warriorBody.rightHand),
      leftThigh: getBodyPartState(warriorBody.leftThigh),
      leftCalf: getBodyPartState(warriorBody.leftCalf),
      leftFoot: getBodyPartState(warriorBody.leftFoot),
      rightThigh: getBodyPartState(warriorBody.rightThigh),
      rightCalf: getBodyPartState(warriorBody.rightCalf),
      rightFoot: getBodyPartState(warriorBody.rightFoot),
      sword: {
        ...getBodyPartState(warriorBody.sword),
        attachedTo: originalWarrior.sword.attachedTo,
      },
      joints: {
        neck: getJointState(warriorBody.joints.neck),
        head: getJointState(warriorBody.joints.head),
        leftShoulder: getJointState(warriorBody.joints.leftShoulder),
        leftElbow: getJointState(warriorBody.joints.leftElbow),
        leftWrist: getJointState(warriorBody.joints.leftWrist),
        rightShoulder: getJointState(warriorBody.joints.rightShoulder),
        rightElbow: getJointState(warriorBody.joints.rightElbow),
        rightWrist: getJointState(warriorBody.joints.rightWrist),
        leftHip: getJointState(warriorBody.joints.leftHip),
        leftKnee: getJointState(warriorBody.joints.leftKnee),
        leftAnkle: getJointState(warriorBody.joints.leftAnkle),
        rightHip: getJointState(warriorBody.joints.rightHip),
        rightKnee: getJointState(warriorBody.joints.rightKnee),
        rightAnkle: getJointState(warriorBody.joints.rightAnkle),
        swordJoint: getJointState(warriorBody.joints.swordJoint),
      },
    };

    return newWarrior;
  });

  return {
    ...physicsState.sourceGameState,
    warriors: updatedWarriors,
  };
}

function getBodyPartState(body: Body): { position: Vector2D; vertices: Vector2D[] } {
  const position = body.getPosition();
  return {
    position: { x: position.x, y: position.y },
    vertices: getBodyVertices(body),
  };
}

function getBodyVertices(body: Body): Vector2D[] {
  const vertices: Vector2D[] = [];
  for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
    const shape = fixture.getShape();
    if (shape.getType() === 'polygon') {
      const polygon = shape as planck.PolygonShape;
      for (let i = 0; i < polygon.m_count; i++) {
        const v = body.getWorldPoint(polygon.m_vertices[i]);
        vertices.push({ x: v.x, y: v.y });
      }
    }
  }
  return vertices;
}

function getJointState(joint: planck.RevoluteJoint): JointState {
  return {
    angle: joint.getJointAngle(),
    anchorA: vecToVector2D(joint.getAnchorA()),
    anchorB: vecToVector2D(joint.getAnchorB()),
  };
}

function vecToVector2D(vec: planck.Vec2): Vector2D {
  return { x: vec.x, y: vec.y };
}