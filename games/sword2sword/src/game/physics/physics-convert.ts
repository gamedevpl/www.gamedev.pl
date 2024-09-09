import * as planck from 'planck';
import {
  PhysicsState,
  PhysicsConfig,
  DEFAULT_PHYSICS_CONFIG,
  WarriorPhysicsBody,
  createBodyPart,
  Body,
  World,
} from './physics-types';
import { GameState, WarriorState } from '../game-state/game-state-types';

export function initPhysicsState(gameState: GameState, config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG): PhysicsState {
  const world = new planck.World(config.gravity);

  // Create arena barriers
  const arenaFixtures = createArenaBarriers(world, config);

  // Create warrior bodies
  const warriorBodies = gameState.warriors.map((warrior) => createWarriorBody(world, warrior, config));

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

function createWarriorBody(world: World, warrior: WarriorState, _config: PhysicsConfig): WarriorPhysicsBody {
  const bodyVertices = [planck.Vec2(-20, -50), planck.Vec2(20, -50), planck.Vec2(20, 50), planck.Vec2(-20, 50)];

  const body = createBodyPart(world, bodyVertices, {
    type: 'dynamic',
    position: planck.Vec2(warrior.position.x, warrior.position.y),
    fixedRotation: false,
  });

  const swordVertices = [planck.Vec2(0, 0), planck.Vec2(10, 0), planck.Vec2(10, 80), planck.Vec2(0, 80)];

  const sword = createBodyPart(world, swordVertices, {
    type: 'dynamic',
    position: planck.Vec2(warrior.position.x - 20, warrior.position.y - 50),
  });

  const joint = world.createJoint(
    planck.RevoluteJoint(
      {
        // lowerAngle: -0.25 * Math.PI,
        // upperAngle: 0.25 * Math.PI,
        // enableLimit: true,
        // enableMotor: true,
      },
      body,
      sword,
      body.getWorldPoint(planck.Vec2(-20, -50)),
    ),
  )!;

  return {
    body,
    sword,
    joint,
  };
}

export function physicsStateToGameState(physicsState: PhysicsState): GameState {
  const updatedWarriors = physicsState.warriorBodies.map((warriorBody, index) => {
    const originalWarrior = physicsState.sourceGameState.warriors[index];
    const position = warriorBody.body.getPosition();

    const newWarrior: WarriorState = {
      ...originalWarrior,
      position: { x: position.x, y: position.y },
      vertices: getBodyVertices(warriorBody.body),
      sword: getBodyVertices(warriorBody.sword), // Add sword vertices
    };

    return newWarrior;
  });

  return {
    ...physicsState.sourceGameState,
    warriors: updatedWarriors,
  };
}

function getBodyVertices(body: Body): { x: number; y: number }[] {
  const vertices: { x: number; y: number }[] = [];
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
