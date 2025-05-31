import { UpdateContext } from '../world-types';
import { interactionsDefinitions } from './index';
import { calculateWrappedDistance } from '../utils/math-utils';

export function interactionsUpdate(context: UpdateContext): void {
  const { gameState } = context;
  const entitiesMap = gameState.entities.entities;
  const allEntities = Array.from(entitiesMap.values());

  for (const interaction of interactionsDefinitions) {
    for (const sourceEntity of allEntities) {
      // Check source type if specified
      if (interaction.sourceType && sourceEntity.type !== interaction.sourceType) {
        continue;
      }

      for (const targetEntity of allEntities) {
        // Entity cannot interact with itself
        if (sourceEntity.id === targetEntity.id) {
          continue;
        }

        // Check target type if specified
        if (interaction.targetType && targetEntity.type !== interaction.targetType) {
          continue;
        }

        // Check distance
        const distance = calculateWrappedDistance(
          sourceEntity.position,
          targetEntity.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );

        if (distance <= interaction.maxDistance) {
          // Check custom conditions and perform if met
          if (interaction.checker(sourceEntity, targetEntity, context)) {
            interaction.perform(sourceEntity, targetEntity, context);
          }
        }
      }
    }
  }
}
