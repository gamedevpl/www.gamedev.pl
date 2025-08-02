import {
  CHARACTER_RADIUS
} from '../ui-consts.ts';
import { HumanEntity } from '../entities/characters/human/human-types';
import { InteractionDefinition } from './interactions-types';
import { calculateWrappedDistance, vectorNormalize, vectorScale, vectorSubtract } from '../utils/math-utils';

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
