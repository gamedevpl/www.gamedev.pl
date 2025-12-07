/**
 * Comprehensive test utilities for behavior tree testing.
 * This file provides mock entities, contexts, and helper functions for testing behaviors.
 */

import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { UpdateContext, GameWorldState } from '../../../../world-types';
import { Blackboard, BlackboardData } from '../../behavior-tree-blackboard';
import { EntityId } from '../../../../entities/entities-types';
import { FoodItem } from '../../../../food/food-types';
import { Vector2D } from '../../../../utils/math-types';
import { createIndexedWorldState } from './search-index-mock';
import { IndexedWorldState } from '../../../../world-index/world-index-types';

/**
 * Creates a mock HumanEntity with sensible defaults for testing.
 */
export function createMockHuman(overrides: Partial<HumanEntity> = {}): HumanEntity {
  const id = overrides.id || ('human-test-1' as EntityId);
  const blackboard = Blackboard.create();
  
  return {
    id,
    type: 'human',
    position: { x: 500, y: 500 },
    direction: { x: 0, y: 0 },
    age: 25,
    maxAge: 70,
    hunger: 50,
    hitpoints: 100,
    maxHitpoints: 100,
    gender: 'male',
    food: [],
    maxFood: 10,
    isAdult: true,
    ancestorIds: [],
    aiBlackboard: blackboard,
    activeAction: 'idle',
    ...overrides,
  } as HumanEntity;
}

/**
 * Creates a mock PreyEntity with sensible defaults for testing.
 */
export function createMockPrey(overrides: Partial<PreyEntity> = {}): PreyEntity {
  const id = overrides.id || ('prey-test-1' as EntityId);
  const blackboard = Blackboard.create();
  
  return {
    id,
    type: 'prey',
    position: { x: 500, y: 500 },
    direction: { x: 0, y: 0 },
    age: 5,
    maxAge: 15,
    hunger: 50,
    hitpoints: 50,
    maxHitpoints: 50,
    gender: 'male',
    geneCode: 12345,
    aiBlackboard: blackboard,
    activeAction: 'idle',
    isAdult: true,
    ...overrides,
  } as PreyEntity;
}

/**
 * Creates a mock PredatorEntity with sensible defaults for testing.
 */
export function createMockPredator(overrides: Partial<PredatorEntity> = {}): PredatorEntity {
  const id = overrides.id || ('predator-test-1' as EntityId);
  const blackboard = Blackboard.create();
  
  return {
    id,
    type: 'predator',
    position: { x: 500, y: 500 },
    direction: { x: 0, y: 0 },
    age: 5,
    maxAge: 12,
    hunger: 50,
    hitpoints: 80,
    maxHitpoints: 80,
    gender: 'male',
    geneCode: 67890,
    aiBlackboard: blackboard,
    activeAction: 'idle',
    isAdult: true,
    ...overrides,
  } as PredatorEntity;
}

/**
 * Creates a mock UpdateContext with sensible defaults for testing.
 * This creates a basic context without search indexes.
 * For behaviors that need spatial queries, use createMockIndexedContext instead.
 */
export function createMockContext(overrides: Partial<UpdateContext> = {}): UpdateContext {
  const entities: Record<EntityId, HumanEntity | PreyEntity | PredatorEntity> = {};
  
  const gameState: GameWorldState = {
    time: 0,
    entities: {
      entities,
      nextId: 1,
    },
    mapDimensions: { width: 1000, height: 1000 },
    ...(overrides.gameState || {}),
  } as GameWorldState;
  
  return {
    deltaTime: 1,
    gameState,
    ...overrides,
  } as UpdateContext;
}

/**
 * Creates a mock UpdateContext with search indexes enabled.
 * Use this for testing behaviors that use findClosestEntity or other spatial queries.
 */
export function createMockIndexedContext(overrides: Partial<UpdateContext> = {}): UpdateContext {
  const context = createMockContext(overrides);
  
  // Convert the game state to an indexed world state
  const indexedState = createIndexedWorldState(context.gameState);
  
  return {
    ...context,
    gameState: indexedState,
  };
}

/**
 * Creates a food item for testing.
 */
export function createMockFoodItem(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    type: 'berries',
    nutritionValue: 10,
    sourceId: 'bush-1' as EntityId,
    ...overrides,
  };
}

/**
 * Adds an entity to a context's entity list.
 * If the context is indexed, this will rebuild the search indexes.
 */
export function addEntityToContext(context: UpdateContext, entity: HumanEntity | PreyEntity | PredatorEntity | any): void {
  context.gameState.entities.entities[entity.id] = entity;
  
  // If this is an indexed context, rebuild the indexes
  if ('search' in context.gameState) {
    const indexedState = createIndexedWorldState(context.gameState);
    (context.gameState as any).search = indexedState.search;
  }
}

/**
 * Advances game time in a context.
 */
export function advanceTime(context: UpdateContext, hours: number): void {
  context.gameState.time += hours;
}

/**
 * Creates a position at a specific distance from a reference position.
 */
export function createPositionAt(referencePos: Vector2D, distance: number, angle: number = 0): Vector2D {
  return {
    x: referencePos.x + distance * Math.cos(angle),
    y: referencePos.y + distance * Math.sin(angle),
  };
}

/**
 * Test result logger for debugging.
 */
export class BehaviorTestLogger {
  private logs: string[] = [];
  
  log(message: string): void {
    this.logs.push(message);
  }
  
  getLogs(): string[] {
    return this.logs;
  }
  
  clear(): void {
    this.logs = [];
  }
  
  print(): void {
    console.log(this.logs.join('\n'));
  }
}

/**
 * Executes a behavior multiple times and returns status history.
 */
export function executeBehaviorMultipleTimes(
  behavior: any,
  entity: any,
  context: UpdateContext,
  blackboard: BlackboardData,
  times: number
): Array<{ tick: number; status: any; debugInfo?: string }> {
  const results: Array<{ tick: number; status: any; debugInfo?: string }> = [];
  
  for (let i = 0; i < times; i++) {
    const result = behavior.execute(entity, context, blackboard);
    const status = Array.isArray(result) ? result[0] : result;
    const debugInfo = Array.isArray(result) && result.length > 1 ? result[1] : undefined;
    
    results.push({ tick: i + 1, status, debugInfo });
  }
  
  return results;
}

/**
 * Asserts that a behavior returns expected status sequence.
 */
export function assertStatusSequence(
  actual: Array<{ status: any }>,
  expected: any[]
): void {
  if (actual.length !== expected.length) {
    throw new Error(
      `Status sequence length mismatch: expected ${expected.length}, got ${actual.length}`
    );
  }
  
  for (let i = 0; i < expected.length; i++) {
    if (actual[i].status !== expected[i]) {
      throw new Error(
        `Status mismatch at tick ${i + 1}: expected ${expected[i]}, got ${actual[i].status}`
      );
    }
  }
}
