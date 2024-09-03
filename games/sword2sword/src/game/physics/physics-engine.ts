import * as RAPIER from '@dimforge/rapier3d';
import { Position, Rotation, CharacterState, BattlePhysicsState, CharacterPhysics } from '../battle-state/battle-types';
import {
  CHARACTER_RADIUS,
  CHARACTER_HEIGHT,
  ARENA_SIZE,
  WALL_HEIGHT,
  WALL_THICKNESS,
} from '../shared/geometry-definitions';

export class PhysicsEngine {
  private world: RAPIER.World;
  private characters: Map<number, RAPIER.RigidBody> = new Map();
  private arena: RAPIER.RigidBody;

  constructor(gravity: number) {
    this.world = new RAPIER.World(new RAPIER.Vector3(0, gravity, 0));
    const arenaBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    // Floor
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(ARENA_SIZE / 2, 0.1, ARENA_SIZE / 2), arenaBody);

    // Walls
    const wallDesc = RAPIER.ColliderDesc.cuboid(ARENA_SIZE / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2);
    this.world.createCollider(wallDesc.setTranslation(0, WALL_HEIGHT / 2, ARENA_SIZE / 2), arenaBody);
    this.world.createCollider(wallDesc.setTranslation(0, WALL_HEIGHT / 2, -ARENA_SIZE / 2), arenaBody);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(WALL_THICKNESS / 2, WALL_HEIGHT / 2, ARENA_SIZE / 2).setTranslation(
        ARENA_SIZE / 2,
        WALL_HEIGHT / 2,
        0,
      ),
      arenaBody,
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(WALL_THICKNESS / 2, WALL_HEIGHT / 2, ARENA_SIZE / 2).setTranslation(
        -ARENA_SIZE / 2,
        WALL_HEIGHT / 2,
        0,
      ),
      arenaBody,
    );

    this.arena = arenaBody;
  }

  createCharacter(character: CharacterState) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(character.position.x, character.position.y, character.position.z)
      .setLinearDamping(0.2)
      .setAngularDamping(0.5);
    const rigidBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(CHARACTER_HEIGHT / 2 - CHARACTER_RADIUS, CHARACTER_RADIUS);
    this.world.createCollider(colliderDesc, rigidBody);

    this.characters.set(this.characters.size, rigidBody);
  }

  step(timeDelta: number) {
    this.world.timestep = timeDelta;
    this.world.step();
  }

  getState(): BattlePhysicsState {
    return {
      characters: Array.from(this.characters.entries()).map(([index, body]) => ({
        id: index.toString(),
        position: this.vectorToPosition(body.translation()),
        rotation: this.vectorToRotation(body.rotation()),
        velocity: this.vectorToPosition(body.linvel()),
        angularVelocity: this.vectorToRotation(body.angvel()),
        characterState: {} as CharacterState, // This should be updated with actual character state
      })),
      arena: {
        id: 'arena',
        position: this.vectorToPosition(this.arena.translation()),
        rotation: this.vectorToRotation(this.arena.rotation()),
        velocity: this.vectorToPosition(this.arena.linvel()),
        angularVelocity: this.vectorToRotation(this.arena.angvel()),
        arenaState: { width: ARENA_SIZE, height: ARENA_SIZE },
      },
    };
  }

  getCharacterPhysics(index: number): CharacterPhysics {
    const body = this.characters.get(index);
    if (!body) {
      throw new Error(`No character found at index ${index}`);
    }
    return {
      id: index.toString(),
      position: this.vectorToPosition(body.translation()),
      rotation: this.vectorToRotation(body.rotation()),
      velocity: this.vectorToPosition(body.linvel()),
      angularVelocity: this.vectorToRotation(body.angvel()),
      characterState: {} as CharacterState, // This should be updated with actual character state
    };
  }

  setCharacterVelocity(index: number, velocity: Position) {
    const body = this.characters.get(index);
    if (body) {
      body.setLinvel(new RAPIER.Vector3(velocity.x, velocity.y, velocity.z), true);
    }
  }

  setCharacterAngularVelocity(index: number, angularVelocity: Rotation) {
    const body = this.characters.get(index);
    if (body) {
      body.setAngvel(new RAPIER.Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z), true);
    }
  }

  isCharacterGrounded(index: number): boolean {
    const body = this.characters.get(index);
    if (body) {
      const position = body.translation();
      const ray = new RAPIER.Ray(position, new RAPIER.Vector3(0, -1, 0));
      const hit = this.world.castRay(ray, 0.6, true);
      return hit !== null;
    }
    return false;
  }

  private vectorToPosition(vector: RAPIER.Vector3): Position {
    return { x: vector.x, y: vector.y, z: vector.z };
  }

  private vectorToRotation(vector: RAPIER.Vector3): Rotation {
    return { x: vector.x, y: vector.y, z: vector.z };
  }
}
