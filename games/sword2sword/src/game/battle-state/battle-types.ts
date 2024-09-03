export type Position = { x: number; y: number; z: number };
export type Rotation = { x: number; y: number; z: number };

export type CharacterState = {
  position: Position;
  rotation: Rotation;
  health: number;
  isJumping: boolean;
  isAttacking: boolean;
  isBlocking: boolean;
  equipment: {
    armor: number;
    helmet: boolean;
    shield: boolean;
    sword: boolean;
  };
};

export type ArenaState = {
  width: number;
  height: number;
};

export type BattleState = {
  characters: CharacterState[];
  arenaState: ArenaState;
  gameTime: number;
};

export enum CharacterAction {
  NONE,
  MOVE_UP,
  MOVE_DOWN,
  MOVE_LEFT,
  MOVE_RIGHT,
  ROTATE_LEFT,
  ROTATE_RIGHT,
  JUMP,
  DUCK,
  ATTACK,
  BLOCK,
}

export type CharacterInput = {
  actionEnabled: Partial<Record<CharacterAction, boolean>>;
  intensity?: number; // For analog inputs like gamepad sticks
};

export type GameInput = {
  playerIndex: number;
  input: CharacterInput;
};

// Generic types for physics objects
export interface PhysicsObject {
  id: string;
  position: Position;
  rotation: Rotation;
  velocity: Position;
  angularVelocity: Rotation;
}

export interface CharacterPhysics extends PhysicsObject {
  characterState: CharacterState;
}

export interface ArenaPhysics extends PhysicsObject {
  arenaState: ArenaState;
}

export type BattlePhysicsState = {
  characters: CharacterPhysics[];
  arena: ArenaPhysics;
};

// Generic geometry definitions
export interface GeometryDefinition {
  type: 'box' | 'sphere' | 'capsule';
  dimensions: { width?: number; height?: number; depth?: number; radius?: number };
}

export interface CharacterGeometry {
  bodyGeometry: GeometryDefinition;
  headGeometry: GeometryDefinition;
  swordGeometry: GeometryDefinition;
}

export interface ArenaGeometry {
  floorGeometry: GeometryDefinition;
  wallGeometry: GeometryDefinition;
}

export type GeometryCreator<T> = () => T;
