import * as RAPIER from '@dimforge/rapier2d';
import { GameState } from '../game-state/game-state-types';

export type PhysicsState = {
  world: RAPIER.World;
  sourceGameState: GameState;
  warriorBodies: RAPIER.RigidBody[];
  arenaBarriers: RAPIER.Collider[];
};

export type PhysicsConfig = {
  arenaWidth: number;
  arenaHeight: number;
  gravity: number;
  warriorMass: number;
  warriorFriction: number;
  warriorRestitution: number;
  linearDamping: number;
};

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  arenaWidth: 800,
  arenaHeight: 600,
  gravity: -9.81,
  warriorMass: 70,
  warriorFriction: 0.2,
  warriorRestitution: 0.2,
  linearDamping: 0.5,
};