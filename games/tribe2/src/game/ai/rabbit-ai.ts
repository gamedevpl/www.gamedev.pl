import { BTNode, BTStatus, BTContext, BehaviorTreeComponent } from './behavior-tree-types';
import { Sequence, Selector } from './behavior-tree-nodes';
import { Entity, BiomeType, GameWorldState } from '../world-types';
import {
  RABBIT_SPEED,
  RABBIT_VISION_RANGE,
  WATER_LEVEL,
  HEIGHT_MAP_RESOLUTION,
  MAP_WIDTH,
  MAP_HEIGHT,
} from '../constants/world-constants';
import { vectorDistance, vectorNormalize, vectorScale, dirToTarget } from '../utils/math-utils';
import { Vector2D } from '../types/math-types';

// --- Helper Types ---
interface RabbitContext extends BTContext {
  entity: Entity;
  state: GameWorldState;
  deltaTime: number;
  targetPosition?: Vector2D;
}

// --- Helpers ---

/**
 * Checks if a given world coordinate is on land (above water level).
 */
function isLand(state: GameWorldState, x: number, y: number): boolean {
  const gridX = Math.floor(x / HEIGHT_MAP_RESOLUTION);
  const gridY = Math.floor(y / HEIGHT_MAP_RESOLUTION);
  const gridW = state.heightMap[0].length;
  const gridH = state.heightMap.length;

  // Handle wrapping for grid lookup
  const wrappedX = ((gridX % gridW) + gridW) % gridW;
  const wrappedY = ((gridY % gridH) + gridH) % gridH;

  return state.heightMap[wrappedY][wrappedX] >= WATER_LEVEL;
}

// --- Condition Nodes ---

class IsHungryNode implements BTNode {
  execute(context: BTContext): BTStatus {
    const ctx = context as RabbitContext;
    const needs = ctx.entity.needs;
    if (!needs) return BTStatus.FAILURE;
    // Hungry if hunger is > 50%
    return needs.hunger > needs.maxHunger * 0.5 ? BTStatus.SUCCESS : BTStatus.FAILURE;
  }
}

class IsThirstyNode implements BTNode {
  execute(context: BTContext): BTStatus {
    const ctx = context as RabbitContext;
    const needs = ctx.entity.needs;
    if (!needs) return BTStatus.FAILURE;
    // Thirsty if thirst is > 50%
    return needs.thirst > needs.maxThirst * 0.5 ? BTStatus.SUCCESS : BTStatus.FAILURE;
  }
}

// --- Action Nodes ---

class WanderNode implements BTNode {
  execute(context: BTContext): BTStatus {
    const ctx = context as RabbitContext;
    const { entity, state, deltaTime } = ctx;

    // If we don't have a target or we reached it, pick a new one
    if (
      !ctx.targetPosition ||
      vectorDistance(entity.position, ctx.targetPosition) < 10
    ) {
      // Try to find a valid land target
      let foundValidTarget = false;
      let attempts = 0;
      
      while (!foundValidTarget && attempts < 10) {
        attempts++;
        
        // Pick a random point within vision range
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * RABBIT_VISION_RANGE;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        
        // Simple wrapping logic for target selection
        let tx = entity.position.x + dx;
        let ty = entity.position.y + dy;
        
        // Wrap coordinates
        tx = ((tx % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
        ty = ((ty % MAP_HEIGHT) + MAP_HEIGHT) % MAP_HEIGHT;

        // Check if the target is on land
        if (isLand(state, tx, ty)) {
          ctx.targetPosition = { x: tx, y: ty };
          foundValidTarget = true;
        }
      }
      
      // If we couldn't find a land target after retries, just stay put for this frame
      if (!foundValidTarget) {
        ctx.targetPosition = undefined;
        return BTStatus.FAILURE;
      }
    }

    // Move towards target
    if (ctx.targetPosition) {
      const dir = dirToTarget(entity.position, ctx.targetPosition, state.mapDimensions);
      entity.velocity = vectorScale(dir, RABBIT_SPEED);
      
      // Update direction for rendering
      if (vectorDistance({x:0, y:0}, entity.velocity) > 0.1) {
          entity.direction = vectorNormalize(entity.velocity);
      }
    }

    // Increase hunger/thirst slightly while wandering
    if (entity.needs) {
      entity.needs.hunger += 2 * deltaTime;
      entity.needs.thirst += 2 * deltaTime;
    }

    return BTStatus.RUNNING;
  }
}

class FindGrassNode implements BTNode {
  execute(context: BTContext): BTStatus {
    const ctx = context as RabbitContext;
    const { entity, state } = ctx;
    const { biomeMap } = state;

    // Search radius in grid cells
    const range = Math.ceil(RABBIT_VISION_RANGE / HEIGHT_MAP_RESOLUTION);
    const gridX = Math.floor(entity.position.x / HEIGHT_MAP_RESOLUTION);
    const gridY = Math.floor(entity.position.y / HEIGHT_MAP_RESOLUTION);
    const gridW = biomeMap[0].length;
    const gridH = biomeMap.length;

    let bestDist = Infinity;
    let bestPos: Vector2D | null = null;

    // Spiral search or simple box search
    for (let y = -range; y <= range; y++) {
      for (let x = -range; x <= range; x++) {
        const checkX = ((gridX + x) % gridW + gridW) % gridW;
        const checkY = ((gridY + y) % gridH + gridH) % gridH;

        if (biomeMap[checkY][checkX] === BiomeType.GRASS) {
          const worldPos = {
            x: checkX * HEIGHT_MAP_RESOLUTION + HEIGHT_MAP_RESOLUTION / 2,
            y: checkY * HEIGHT_MAP_RESOLUTION + HEIGHT_MAP_RESOLUTION / 2,
          };
          
          const dist = vectorDistance(entity.position, worldPos);
          if (dist < bestDist) {
            bestDist = dist;
            bestPos = worldPos;
          }
        }
      }
    }

    if (bestPos) {
      ctx.targetPosition = bestPos;
      return BTStatus.SUCCESS;
    }

    return BTStatus.FAILURE;
  }
}

class FindWaterNode implements BTNode {
  execute(context: BTContext): BTStatus {
    const ctx = context as RabbitContext;
    const { entity, state } = ctx;
    const { heightMap } = state;

    const range = Math.ceil(RABBIT_VISION_RANGE / HEIGHT_MAP_RESOLUTION);
    const gridX = Math.floor(entity.position.x / HEIGHT_MAP_RESOLUTION);
    const gridY = Math.floor(entity.position.y / HEIGHT_MAP_RESOLUTION);
    const gridW = heightMap[0].length;
    const gridH = heightMap.length;

    let bestDist = Infinity;
    let bestPos: Vector2D | null = null;

    for (let y = -range; y <= range; y++) {
      for (let x = -range; x <= range; x++) {
        const checkX = ((gridX + x) % gridW + gridW) % gridW;
        const checkY = ((gridY + y) % gridH + gridH) % gridH;

        // Found water?
        if (heightMap[checkY][checkX] < WATER_LEVEL) {
          // Don't go TO the water, find a neighbor that is LAND (shore)
          const neighbors = [
            { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
            { dx: 1, dy: 0 }, { dx: -1, dy: 0 }
          ];

          for (const n of neighbors) {
            const nx = ((checkX + n.dx) % gridW + gridW) % gridW;
            const ny = ((checkY + n.dy) % gridH + gridH) % gridH;

            if (heightMap[ny][nx] >= WATER_LEVEL) {
              // This neighbor is land (shore)
              const shorePos = {
                x: nx * HEIGHT_MAP_RESOLUTION + HEIGHT_MAP_RESOLUTION / 2,
                y: ny * HEIGHT_MAP_RESOLUTION + HEIGHT_MAP_RESOLUTION / 2,
              };

              const dist = vectorDistance(entity.position, shorePos);
              if (dist < bestDist) {
                bestDist = dist;
                bestPos = shorePos;
              }
            }
          }
        }
      }
    }

    if (bestPos) {
      ctx.targetPosition = bestPos;
      return BTStatus.SUCCESS;
    }

    return BTStatus.FAILURE;
  }
}

class MoveToTargetNode implements BTNode {
  execute(context: BTContext): BTStatus {
    const ctx = context as RabbitContext;
    const { entity, state, targetPosition } = ctx;

    if (!targetPosition) return BTStatus.FAILURE;

    const dist = vectorDistance(entity.position, targetPosition);
    if (dist < 10) {
      entity.velocity = { x: 0, y: 0 };
      return BTStatus.SUCCESS;
    }

    const dir = dirToTarget(entity.position, targetPosition, state.mapDimensions);
    entity.velocity = vectorScale(dir, RABBIT_SPEED);
    
    if (vectorDistance({x:0, y:0}, entity.velocity) > 0.1) {
        entity.direction = vectorNormalize(entity.velocity);
    }

    return BTStatus.RUNNING;
  }
}

class EatNode implements BTNode {
  execute(context: BTContext): BTStatus {
    const ctx = context as RabbitContext;
    const { entity, state, deltaTime } = ctx;

    if (entity.needs) {
      entity.needs.hunger = Math.max(0, entity.needs.hunger - 50 * deltaTime); // Eat fast
      entity.needs.thirst += 5 * deltaTime; // Eating makes you a bit thirsty
      
      // Chance to deplete grass
      if (Math.random() < 0.01) { // 1% chance per tick
        const gridX = Math.floor(entity.position.x / HEIGHT_MAP_RESOLUTION);
        const gridY = Math.floor(entity.position.y / HEIGHT_MAP_RESOLUTION);
        const gridW = state.biomeMap[0].length;
        const gridH = state.biomeMap.length;
        
        const wrappedX = ((gridX % gridW) + gridW) % gridW;
        const wrappedY = ((gridY % gridH) + gridH) % gridH;

        if (state.biomeMap[wrappedY][wrappedX] === BiomeType.GRASS) {
          state.biomeMap[wrappedY][wrappedX] = BiomeType.SAND;
        }
      }

      if (entity.needs.hunger <= 0) {
          ctx.targetPosition = undefined; // Clear target when done
          return BTStatus.SUCCESS;
      }
    }
    return BTStatus.RUNNING;
  }
}

class DrinkNode implements BTNode {
  execute(context: BTContext): BTStatus {
    const ctx = context as RabbitContext;
    const { entity, deltaTime } = ctx;

    if (entity.needs) {
      entity.needs.thirst = Math.max(0, entity.needs.thirst - 50 * deltaTime); // Drink fast
      
      if (entity.needs.thirst <= 0) {
          ctx.targetPosition = undefined; // Clear target when done
          return BTStatus.SUCCESS;
      }
    }
    return BTStatus.RUNNING;
  }
}

// --- Factory ---

export function createRabbitBehaviorTree(): BehaviorTreeComponent {
  const root = new Selector([
    new Sequence([
      new IsThirstyNode(),
      new FindWaterNode(),
      new MoveToTargetNode(),
      new DrinkNode(),
    ]),
    new Sequence([
      new IsHungryNode(),
      new FindGrassNode(),
      new MoveToTargetNode(),
      new EatNode(),
    ]),
    new WanderNode(),
  ]);

  return {
    tree: {
      root,
      context: {},
    },
  };
}
