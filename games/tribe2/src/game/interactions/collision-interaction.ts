import { CHARACTER_RADIUS } from '../ui/ui-consts.ts';
import { HumanEntity } from '../entities/characters/human/human-types';
import { InteractionDefinition } from './interactions-types';
import { calculateWrappedDistance, vectorNormalize, vectorScale, getDirectionVectorOnTorus } from '../utils/math-utils';
import { TreeEntity } from '../entities/plants/tree/tree-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { TREE_RADIUS } from '../entities/plants/tree/tree-consts';
import { BuildingEntity } from '../entities/buildings/building-types';
import { BuildingType as BuildingTypeEnum } from '../entities/buildings/building-consts';

export const humanCollisionInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id: 'human-collision',
  sourceType: 'human',
  targetType: 'human',
  maxDistance: CHARACTER_RADIUS * 2,
  checker: (source, target, { gameState }) => {
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return distance < (source.radius + target.radius) / 3;
  },
  perform: (source, target, { gameState }) => {
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance === 0) {
      source.forces.push({ x: 0.1, y: 0 });
      target.forces.push({ x: -0.1, y: 0 });
      return;
    }

    const overlap = (source.radius + target.radius) / 3 - distance;
    if (overlap <= 0) return;

    const forceMagnitude = overlap * 0.05;
    const direction = vectorNormalize(
      getDirectionVectorOnTorus(
        target.position,
        source.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      ),
    );
    const pushVector = vectorScale(direction, forceMagnitude);

    source.forces.push(pushVector);
    target.forces.push(vectorScale(pushVector, -1));
  },
};

export const humanTreeCollisionInteraction: InteractionDefinition<HumanEntity, TreeEntity> = {
  id: 'human-tree-collision',
  sourceType: 'human',
  targetType: 'tree',
  maxDistance: CHARACTER_RADIUS + TREE_RADIUS,
  checker: (source, target, { gameState }) => {
    const state = target.stateMachine[0];
    if (state === 'fallen' || state === 'stump') {
      return false;
    }

    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.5;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return distance < effectiveSourceRadius + trunkRadius;
  },
  perform: (source, target, { gameState }) => {
    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.5;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance === 0) {
      source.forces.push({ x: 1.0, y: 0 });
      return;
    }

    const overlap = effectiveSourceRadius + trunkRadius - distance;
    if (overlap <= 0) return;

    const direction = vectorNormalize(
      getDirectionVectorOnTorus(
        target.position,
        source.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      ),
    );

    // Repulsion force
    const forceMagnitude = overlap * 15.0;
    source.forces.push(vectorScale(direction, forceMagnitude));

    // Hard Position Projection
    const { width, height } = gameState.mapDimensions;
    const correction = vectorScale(direction, overlap);
    source.position.x = (source.position.x + correction.x + width) % width;
    source.position.y = (source.position.y + correction.y + height) % height;
  },
};

export const preyTreeCollisionInteraction: InteractionDefinition<PreyEntity, TreeEntity> = {
  id: 'prey-tree-collision',
  sourceType: 'prey',
  targetType: 'tree',
  maxDistance: CHARACTER_RADIUS + TREE_RADIUS,
  checker: (source, target, { gameState }) => {
    const state = target.stateMachine[0];
    if (state === 'fallen' || state === 'stump') {
      return false;
    }

    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.4;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return distance < effectiveSourceRadius + trunkRadius;
  },
  perform: (source, target, { gameState }) => {
    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.4;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance === 0) {
      source.forces.push({ x: 1.0, y: 0 });
      return;
    }

    const overlap = effectiveSourceRadius + trunkRadius - distance;
    if (overlap <= 0) return;

    const direction = vectorNormalize(
      getDirectionVectorOnTorus(
        target.position,
        source.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      ),
    );

    // Repulsion force
    const forceMagnitude = overlap * 15.0;
    source.forces.push(vectorScale(direction, forceMagnitude));

    // Hard Position Projection
    const { width, height } = gameState.mapDimensions;
    const correction = vectorScale(direction, overlap);
    source.position.x = (source.position.x + correction.x + width) % width;
    source.position.y = (source.position.y + correction.y + height) % height;
  },
};

export const predatorTreeCollisionInteraction: InteractionDefinition<PredatorEntity, TreeEntity> = {
  id: 'predator-tree-collision',
  sourceType: 'predator',
  targetType: 'tree',
  maxDistance: CHARACTER_RADIUS + TREE_RADIUS,
  checker: (source, target, { gameState }) => {
    const state = target.stateMachine[0];
    if (state === 'fallen' || state === 'stump') {
      return false;
    }

    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.4;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return distance < effectiveSourceRadius + trunkRadius;
  },
  perform: (source, target, { gameState }) => {
    const trunkRadius = target.radius * 0.25;
    const effectiveSourceRadius = source.radius * 0.4;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance === 0) {
      source.forces.push({ x: 1.0, y: 0 });
      return;
    }

    const overlap = effectiveSourceRadius + trunkRadius - distance;
    if (overlap <= 0) return;

    const direction = vectorNormalize(
      getDirectionVectorOnTorus(
        target.position,
        source.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      ),
    );

    // Repulsion force
    const forceMagnitude = overlap * 15.0;
    source.forces.push(vectorScale(direction, forceMagnitude));

    // Hard Position Projection
    const { width, height } = gameState.mapDimensions;
    const correction = vectorScale(direction, overlap);
    source.position.x = (source.position.x + correction.x + width) % width;
    source.position.y = (source.position.y + correction.y + height) % height;
  },
};

export const humanBuildingCollisionInteraction: InteractionDefinition<HumanEntity, BuildingEntity> = {
  id: 'human-building-collision',
  sourceType: 'human',
  targetType: 'building',
  maxDistance: 50,
  checker: (source, target, { gameState }) => {
    if (target.buildingType !== BuildingTypeEnum.Palisade && target.buildingType !== BuildingTypeEnum.Gate) {
      return false;
    }

    if (!target.isConstructed) {
      return false;
    }

    // Allow passage through own gates
    if (target.buildingType === BuildingTypeEnum.Gate && source.leaderId === target.ownerId) {
      return false;
    }

    const effectiveSourceRadius = source.radius * 0.5;
    const effectiveTargetRadius = target.radius;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return distance < effectiveSourceRadius + effectiveTargetRadius;
  },
  perform: (source, target, { gameState }) => {
    const effectiveSourceRadius = source.radius * 0.5;
    const effectiveTargetRadius = target.radius;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance === 0) {
      source.forces.push({ x: 1.0, y: 0 });
      return;
    }

    const overlap = effectiveSourceRadius + effectiveTargetRadius - distance;
    if (overlap <= 0) return;

    const direction = vectorNormalize(
      getDirectionVectorOnTorus(
        target.position,
        source.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      ),
    );

    // Repulsion force
    const forceMagnitude = overlap * 15.0;
    source.forces.push(vectorScale(direction, forceMagnitude));

    // Hard Position Projection
    const { width, height } = gameState.mapDimensions;
    const correction = vectorScale(direction, overlap);
    source.position.x = (source.position.x + correction.x + width) % width;
    source.position.y = (source.position.y + correction.y + height) % height;
  },
};

export const preyBuildingCollisionInteraction: InteractionDefinition<PreyEntity, BuildingEntity> = {
  id: 'prey-building-collision',
  sourceType: 'prey',
  targetType: 'building',
  maxDistance: 50,
  checker: (source, target, { gameState }) => {
    if (target.buildingType !== BuildingTypeEnum.Palisade && target.buildingType !== BuildingTypeEnum.Gate) {
      return false;
    }

    if (!target.isConstructed) {
      return false;
    }

    const effectiveSourceRadius = source.radius * 0.5;
    const effectiveTargetRadius = target.radius;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return distance < effectiveSourceRadius + effectiveTargetRadius;
  },
  perform: (source, target, { gameState }) => {
    const effectiveSourceRadius = source.radius * 0.5;
    const effectiveTargetRadius = target.radius;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance === 0) {
      source.forces.push({ x: 1.0, y: 0 });
      return;
    }

    const overlap = effectiveSourceRadius + effectiveTargetRadius - distance;
    if (overlap <= 0) return;

    const direction = vectorNormalize(
      getDirectionVectorOnTorus(
        target.position,
        source.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      ),
    );

    // Repulsion force
    const forceMagnitude = overlap * 15.0;
    source.forces.push(vectorScale(direction, forceMagnitude));

    // Hard Position Projection
    const { width, height } = gameState.mapDimensions;
    const correction = vectorScale(direction, overlap);
    source.position.x = (source.position.x + correction.x + width) % width;
    source.position.y = (source.position.y + correction.y + height) % height;
  },
};

export const predatorBuildingCollisionInteraction: InteractionDefinition<PredatorEntity, BuildingEntity> = {
  id: 'predator-building-collision',
  sourceType: 'predator',
  targetType: 'building',
  maxDistance: 50,
  checker: (source, target, { gameState }) => {
    if (target.buildingType !== BuildingTypeEnum.Palisade && target.buildingType !== BuildingTypeEnum.Gate) {
      return false;
    }

    if (!target.isConstructed) {
      return false;
    }

    const effectiveSourceRadius = source.radius * 0.5;
    const effectiveTargetRadius = target.radius;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    return distance < effectiveSourceRadius + effectiveTargetRadius;
  },
  perform: (source, target, { gameState }) => {
    const effectiveSourceRadius = source.radius * 0.5;
    const effectiveTargetRadius = target.radius;
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    if (distance === 0) {
      source.forces.push({ x: 1.0, y: 0 });
      return;
    }

    const overlap = effectiveSourceRadius + effectiveTargetRadius - distance;
    if (overlap <= 0) return;

    const direction = vectorNormalize(
      getDirectionVectorOnTorus(
        target.position,
        source.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      ),
    );

    // Repulsion force
    const forceMagnitude = overlap * 15.0;
    source.forces.push(vectorScale(direction, forceMagnitude));

    // Hard Position Projection
    const { width, height } = gameState.mapDimensions;
    const correction = vectorScale(direction, overlap);
    source.position.x = (source.position.x + correction.x + width) % width;
    source.position.y = (source.position.y + correction.y + height) % height;
  },
};
