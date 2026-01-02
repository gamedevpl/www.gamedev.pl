import { CHARACTER_RADIUS } from '../ui/ui-consts.ts';
import { HumanEntity } from '../entities/characters/human/human-types';
import { InteractionDefinition } from './interactions-types';
import { getDirectionVectorOnTorus } from '../utils/math-utils';
import { TreeEntity } from '../entities/plants/tree/tree-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { TREE_RADIUS } from '../entities/plants/tree/tree-consts';

// Minimum distance squared for collision handling (avoids division by zero)
const MIN_DISTANCE_SQ_THRESHOLD = 0.0001;

/**
 * Reusable object to avoid allocations in hot paths.
 * IMPORTANT: This is only safe because interactions are processed synchronously
 * in a single-threaded context. The value is consumed immediately after
 * getDirectionFast is called before any other call can overwrite it.
 */
const _tempVector = { x: 0, y: 0 };

/**
 * Optimized inline calculation of wrapped distance squared.
 * Avoids function call overhead and object allocations.
 */
function getWrappedDistanceSqFast(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  worldWidth: number,
  worldHeight: number,
): number {
  let dx = x2 - x1;
  let dy = y2 - y1;

  // Wrap around horizontally if shorter
  if (dx > worldWidth / 2) {
    dx -= worldWidth;
  } else if (dx < -worldWidth / 2) {
    dx += worldWidth;
  }

  // Wrap around vertically if shorter
  if (dy > worldHeight / 2) {
    dy -= worldHeight;
  } else if (dy < -worldHeight / 2) {
    dy += worldHeight;
  }

  return dx * dx + dy * dy;
}

/**
 * Optimized inline calculation of direction vector for collision push.
 * Returns unit vector in _tempVector, avoiding allocations.
 */
function getDirectionFast(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  worldWidth: number,
  worldHeight: number,
): void {
  let dx = x1 - x2;
  let dy = y1 - y2;

  // Wrap around horizontally if shorter
  if (dx > worldWidth / 2) {
    dx -= worldWidth;
  } else if (dx < -worldWidth / 2) {
    dx += worldWidth;
  }

  // Wrap around vertically if shorter
  if (dy > worldHeight / 2) {
    dy -= worldHeight;
  } else if (dy < -worldHeight / 2) {
    dy += worldHeight;
  }

  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) {
    _tempVector.x = 1;
    _tempVector.y = 0;
  } else {
    _tempVector.x = dx / length;
    _tempVector.y = dy / length;
  }
}

export const humanCollisionInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id: 'human-collision',
  sourceType: 'human',
  targetType: 'human',
  maxDistance: CHARACTER_RADIUS * 2,
  checker: (source, target, { gameState }) => {
    // Use fast inline distance calculation
    const distanceSq = getWrappedDistanceSqFast(
      source.position.x,
      source.position.y,
      target.position.x,
      target.position.y,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    const thresholdSq = ((source.radius + target.radius) / 3) * ((source.radius + target.radius) / 3);
    return distanceSq < thresholdSq;
  },
  perform: (source, target, { gameState }) => {
    const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

    // Calculate distance using fast inline method
    const distanceSq = getWrappedDistanceSqFast(
      source.position.x,
      source.position.y,
      target.position.x,
      target.position.y,
      worldWidth,
      worldHeight,
    );

    // Avoid division by zero or extreme forces if entities are exactly on top of each other
    if (distanceSq < MIN_DISTANCE_SQ_THRESHOLD) {
      source.forces.push({ x: 0.1, y: 0 });
      target.forces.push({ x: -0.1, y: 0 });
      return;
    }

    const distance = Math.sqrt(distanceSq);
    const overlap = source.radius + target.radius - distance;

    // The force is proportional to the overlap
    const forceMagnitude = overlap * 0.05; // Stiffness factor

    getDirectionFast(
      source.position.x,
      source.position.y,
      target.position.x,
      target.position.y,
      worldWidth,
      worldHeight,
    );

    // Apply symmetrical forces - create new objects since forces array stores references
    source.forces.push({ x: _tempVector.x * forceMagnitude, y: _tempVector.y * forceMagnitude });
    target.forces.push({ x: -_tempVector.x * forceMagnitude, y: -_tempVector.y * forceMagnitude });
  },
};

export const humanTreeCollisionInteraction: InteractionDefinition<HumanEntity, TreeEntity> = {
  id: 'human-tree-collision',
  sourceType: 'human',
  targetType: 'tree',
  maxDistance: CHARACTER_RADIUS * 0.6 + TREE_RADIUS * 0.4,
  checker: (source, target, { gameState }) => {
    const state = target.stateMachine[0];
    if (state === 'fallen' || state === 'stump') {
      return false;
    }

    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.4;
    const thresholdSq = (effectiveSourceRadius + trunkRadius) * (effectiveSourceRadius + trunkRadius);

    const distanceSq = getWrappedDistanceSqFast(
      source.position.x,
      source.position.y,
      target.position.x,
      target.position.y,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return distanceSq < thresholdSq;
  },
  perform: (source, target, { gameState }) => {
    const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.4;

    const distanceSq = getWrappedDistanceSqFast(
      source.position.x,
      source.position.y,
      target.position.x,
      target.position.y,
      worldWidth,
      worldHeight,
    );

    if (distanceSq < MIN_DISTANCE_SQ_THRESHOLD) {
      source.forces.push({ x: 1.0, y: 0 });
      return;
    }

    const distance = Math.sqrt(distanceSq);
    const overlap = effectiveSourceRadius + trunkRadius - distance;
    if (overlap <= 0) return;

    const forceMagnitude = overlap * 2.5;

    // Push away from tree center using fast inline direction calculation
    const dir = getDirectionVectorOnTorus(
      target.position,
      source.position,
      worldWidth,
      worldHeight,
    );
    const length = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
    if (length > 0) {
      source.forces.push({
        x: (dir.x / length) * forceMagnitude,
        y: (dir.y / length) * forceMagnitude,
      });
    }
  },
};

export const preyTreeCollisionInteraction: InteractionDefinition<PreyEntity, TreeEntity> = {
  id: 'prey-tree-collision',
  sourceType: 'prey',
  targetType: 'tree',
  maxDistance: CHARACTER_RADIUS * 0.6 + TREE_RADIUS * 0.4,
  checker: (source, target, { gameState }) => {
    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.4;
    const thresholdSq = (effectiveSourceRadius + trunkRadius) * (effectiveSourceRadius + trunkRadius);

    const distanceSq = getWrappedDistanceSqFast(
      source.position.x,
      source.position.y,
      target.position.x,
      target.position.y,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return distanceSq < thresholdSq;
  },
  perform: (source, target, { gameState }) => {
    const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.4;

    const distanceSq = getWrappedDistanceSqFast(
      source.position.x,
      source.position.y,
      target.position.x,
      target.position.y,
      worldWidth,
      worldHeight,
    );

    if (distanceSq < MIN_DISTANCE_SQ_THRESHOLD) {
      source.forces.push({ x: 1.0, y: 0 });
      return;
    }

    const distance = Math.sqrt(distanceSq);
    const overlap = effectiveSourceRadius + trunkRadius - distance;
    if (overlap <= 0) return;

    const forceMagnitude = overlap * 2.5;

    const dir = getDirectionVectorOnTorus(
      target.position,
      source.position,
      worldWidth,
      worldHeight,
    );
    const length = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
    if (length > 0) {
      source.forces.push({
        x: (dir.x / length) * forceMagnitude,
        y: (dir.y / length) * forceMagnitude,
      });
    }
  },
};

export const predatorTreeCollisionInteraction: InteractionDefinition<PredatorEntity, TreeEntity> = {
  id: 'predator-tree-collision',
  sourceType: 'predator',
  targetType: 'tree',
  maxDistance: CHARACTER_RADIUS * 0.6 + TREE_RADIUS * 0.4,
  checker: (source, target, { gameState }) => {
    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.4;
    const thresholdSq = (effectiveSourceRadius + trunkRadius) * (effectiveSourceRadius + trunkRadius);

    const distanceSq = getWrappedDistanceSqFast(
      source.position.x,
      source.position.y,
      target.position.x,
      target.position.y,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return distanceSq < thresholdSq;
  },
  perform: (source, target, { gameState }) => {
    const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.4;

    const distanceSq = getWrappedDistanceSqFast(
      source.position.x,
      source.position.y,
      target.position.x,
      target.position.y,
      worldWidth,
      worldHeight,
    );

    if (distanceSq < MIN_DISTANCE_SQ_THRESHOLD) {
      source.forces.push({ x: 1.0, y: 0 });
      return;
    }

    const distance = Math.sqrt(distanceSq);
    const overlap = effectiveSourceRadius + trunkRadius - distance;
    if (overlap <= 0) return;

    const forceMagnitude = overlap * 2.5;

    const dir = getDirectionVectorOnTorus(
      target.position,
      source.position,
      worldWidth,
      worldHeight,
    );
    const length = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
    if (length > 0) {
      source.forces.push({
        x: (dir.x / length) * forceMagnitude,
        y: (dir.y / length) * forceMagnitude,
      });
    }
  },
};
