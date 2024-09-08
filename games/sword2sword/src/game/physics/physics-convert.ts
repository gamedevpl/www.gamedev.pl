import * as Matter from 'matter-js';
import {
  PhysicsState,
  PhysicsConfig,
  DEFAULT_PHYSICS_CONFIG,
  WarriorPhysicsBody,
  createBodyPart,
  Body,
} from './physics-types';
import { GameState, WarriorState } from '../game-state/game-state-types';

export function initPhysicsState(gameState: GameState, config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG): PhysicsState {
  const engine = Matter.Engine.create({
    gravity: config.gravity,
  });
  const world = engine.world;

  // Create arena barriers
  const arenaBarriers = createArenaBarriers(world, config);

  // Create warrior bodies
  const warriorBodies = gameState.warriors.map((warrior) => createWarriorBody(world, warrior, config));

  return {
    engine,
    world,
    sourceGameState: gameState,
    warriorBodies,
    arenaBarriers,
  };
}

function createArenaBarriers(world: Matter.World, config: PhysicsConfig): Body[] {
  const arenaVertices = [
    { x: 0, y: 0 },
    { x: config.arenaWidth, y: 0 },
    { x: config.arenaWidth, y: 50 },
    { x: 0, y: 50 },
  ];
  const ground = Matter.Bodies.fromVertices(config.arenaWidth / 2, config.arenaHeight - 25, [arenaVertices], {
    isStatic: true,
    label: 'ground',
  });

  Matter.Composite.add(world, [ground]);

  return [ground];
}

function createWarriorBody(world: Matter.World, warrior: WarriorState, config: PhysicsConfig): WarriorPhysicsBody {
  const bodyVertices = [
    { x: -20, y: -50 },
    { x: 20, y: -50 },
    { x: 20, y: 50 },
    { x: -20, y: 50 },
  ];

  const body = createBodyPart(bodyVertices, {
    mass: config.warriorMass,
    friction: config.warriorFriction,
    restitution: config.warriorRestitution,
    label: 'warrior',
  });

  Matter.Body.setPosition(body, warrior.position);

  const composite = Matter.Composite.create();
  Matter.Composite.add(composite, [body]);
  Matter.Composite.add(world, composite);

  return {
    body,
    composite,
  };
}

export function updatePhysicsState(physicsState: PhysicsState, gameState: GameState): PhysicsState {
  // Update warrior bodies
  physicsState.warriorBodies.forEach((warriorBody, index) => {
    updateWarriorBody(warriorBody, gameState.warriors[index]);
  });

  // Update source game state
  physicsState.sourceGameState = gameState;

  return physicsState;
}

function updateWarriorBody(warriorBody: WarriorPhysicsBody, warriorState: WarriorState) {
  Matter.Body.setPosition(warriorBody.body, warriorState.position);
}

export function physicsStateToGameState(physicsState: PhysicsState): GameState {
  const updatedWarriors = physicsState.warriorBodies.map((warriorBody, index) => {
    const originalWarrior = physicsState.sourceGameState.warriors[index];

    const newWarrior: WarriorState = {
      ...originalWarrior,
      position: warriorBody.body.position,
      vertices: warriorBody.body.vertices,
    };

    return newWarrior;
  });

  return {
    ...physicsState.sourceGameState,
    warriors: updatedWarriors,
  };
}
