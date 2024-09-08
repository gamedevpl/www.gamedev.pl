import * as Matter from 'matter-js';
import { GameState } from '../game-state/game-state-types';

export type Vector2D = Matter.Vector;

export type Body = Matter.Body;

export type Composite = Matter.Composite;

export type World = Matter.World;

export type Engine = Matter.Engine;

export type PhysicsState = {
  engine: Engine;
  world: World;
  sourceGameState: GameState;
  warriorBodies: WarriorPhysicsBody[];
  arenaBarriers: Body[];
};

export type WarriorPhysicsBody = {
  body: Body;
  composite: Composite;
};

export type PhysicsConfig = {
  arenaWidth: number;
  arenaHeight: number;
  gravity: Vector2D;
  warriorMass: number;
  warriorFriction: number;
  warriorRestitution: number;
  swordMass: number;
};

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  arenaWidth: 800,
  arenaHeight: 600,
  gravity: { x: 0, y: 1 },
  warriorMass: 70,
  warriorFriction: 0.1,
  warriorRestitution: 0.2,
  swordMass: 2,
};

export function createBodyPart(vertices: Matter.Vector[], options: Matter.IBodyDefinition): Body {
  return Matter.Bodies.fromVertices(0, 0, [vertices], options);
}
