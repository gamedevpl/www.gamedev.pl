import { CHARACTER_RADIUS } from '../ui/ui-consts.ts';
import { HumanEntity } from '../entities/characters/human/human-types';
import { InteractionDefinition } from './interactions-types';
import {
  calculateWrappedDistance,
  vectorNormalize,
  vectorScale,
  vectorSubtract,
  getDirectionVectorOnTorus,
} from '../utils/math-utils';
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

    // Avoid division by zero or extreme forces if entities are exactly on top of each other
    if (distance === 0) {
      source.forces.push({ x: 0.1, y: 0 }); // Apply a small default push
      target.forces.push({ x: -0.1, y: 0 });
      return;
    }

    const overlap = source.radius + target.radius - distance;

    // The force is proportional to the overlap
    const forceMagnitude = overlap * 0.05; // Stiffness factor

    const direction = vectorNormalize(vectorSubtract(source.position, target.position));
    const pushVector = vectorScale(direction, forceMagnitude);

    // Apply symmetrical forces
    source.forces.push(pushVector);
    target.forces.push(vectorScale(pushVector, -1));
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

    const forceMagnitude = overlap * 2.5;

    // Push away from tree center
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

    const forceMagnitude = overlap * 2.5;

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

    const forceMagnitude = overlap * 2.5;

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

    const effectiveSourceRadius = source.radius * 0.25;
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
    const effectiveSourceRadius = source.radius * 0.25;
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

    const forceMagnitude = overlap * 2.5;

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

    const effectiveSourceRadius = source.radius * 0.4;
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
    const effectiveSourceRadius = source.radius * 0.4;
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

    const forceMagnitude = overlap * 2.5;

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

    const effectiveSourceRadius = source.radius * 0.4;
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
    const effectiveSourceRadius = source.radius * 0.4;
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

    const forceMagnitude = overlap * 2.5;

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
  },
};
