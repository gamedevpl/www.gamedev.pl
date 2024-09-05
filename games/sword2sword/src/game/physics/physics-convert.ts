import * as RAPIER from '@dimforge/rapier2d';
import { PhysicsState, PhysicsConfig, DEFAULT_PHYSICS_CONFIG } from './physics-types';
import { GameState, WarriorState } from '../game-state/game-state-types';

export function gameStateToPhysicsState(gameState: GameState, config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG): PhysicsState {
  const gravity = new RAPIER.Vector2(0.0, config.gravity);
  const world = new RAPIER.World(gravity);

  // Create arena barriers
  const arenaBarriers = createArenaBarriers(world, config);

  // Create warrior bodies
  const warriorBodies = gameState.warriors.map(warrior => createWarriorBody(world, warrior, config));

  return {
    world,
    sourceGameState: gameState,
    warriorBodies,
    arenaBarriers,
  };
}

function createArenaBarriers(world: RAPIER.World, config: PhysicsConfig): RAPIER.Collider[] {
  const groundDesc = RAPIER.ColliderDesc.cuboid(config.arenaWidth / 2, 0.1);
  const ground = world.createCollider(groundDesc);

  const leftWallDesc = RAPIER.ColliderDesc.cuboid(0.1, config.arenaHeight / 2);
  const leftWall = world.createCollider(leftWallDesc);
  leftWall.setTranslation(new RAPIER.Vector2(0, config.arenaHeight / 2));

  const rightWallDesc = RAPIER.ColliderDesc.cuboid(0.1, config.arenaHeight / 2);
  const rightWall = world.createCollider(rightWallDesc);
  rightWall.setTranslation(new RAPIER.Vector2(config.arenaWidth, config.arenaHeight / 2));

  return [ground, leftWall, rightWall];
}

function createWarriorBody(world: RAPIER.World, warrior: WarriorState, config: PhysicsConfig): RAPIER.RigidBody {
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(warrior.position, config.arenaHeight - warrior.height / 2)
    .setLinearDamping(config.linearDamping);

  const body = world.createRigidBody(bodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.cuboid(warrior.width / 2, warrior.height / 2)
    .setDensity(config.warriorMass / (warrior.width * warrior.height))
    .setFriction(config.warriorFriction)
    .setRestitution(config.warriorRestitution);

  world.createCollider(colliderDesc, body);

  return body;
}

export function physicsStateToGameState(physicsState: PhysicsState): GameState {
  const updatedWarriors = physicsState.warriorBodies.map((body, index) => {
    const position = body.translation();
    const velocity = body.linvel();
    const originalWarrior = physicsState.sourceGameState.warriors[index];

    return {
      ...originalWarrior,
      position: position.x,
      height: originalWarrior.height,
      width: originalWarrior.width,
      velocity: {
        x: velocity.x,
        y: velocity.y,
      },
    };
  });

  return {
    ...physicsState.sourceGameState,
    warriors: updatedWarriors,
  };
}