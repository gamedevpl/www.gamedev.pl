import { InteractionDefinition } from '../interactions-types';
import { vectorDistance, vectorNormalize, vectorSubtract, vectorScale } from '../../math-utils';

// Basic collision detection and response between any entities
export const COLLISIONS: InteractionDefinition = {
  // No type restrictions - applies to all entity pairs
  minDistance: 0,
  maxDistance: 30, // Units of distance for collision detection

  checker: (source, target) => {
    // Exclude carrion entities from collisions
    if (source.type === 'carrion' || target.type === 'carrion') {
      return false;
    }
    const distance = vectorDistance(source.position, target.position);
    return distance < 30; // Same as maxDistance for consistency
  },

  perform: (source, target) => {
    // Calculate the vector from source to target
    const direction = vectorNormalize(vectorSubtract(target.position, source.position));

    // Calculate the overlap/penetration
    const distance = Math.max(vectorDistance(source.position, target.position), 0.1);
    // const overlap = 30 - distance; // How much they overlap

    // Push both entities apart equally
    const pushVector = vectorScale(direction, -1 / distance);

    source.forces.push(pushVector);
  },
};
