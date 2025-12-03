import { UpdateContext } from '../world-types';
import { interactionsDefinitions } from './index';
import { calculateWrappedDistance } from '../utils/math-utils';
import { IndexedWorldState } from '../world-index/world-index-types';

export function interactionsUpdate(context: UpdateContext): void {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;
  const allEntities = Object.values(gameState.entities.entities);

  for (const interaction of interactionsDefinitions) {
    for (const sourceEntity of allEntities) {
      if (interaction.sourceType && sourceEntity.type !== interaction.sourceType) {
        continue;
      }

      const potentialTargets = indexedState.search[interaction.targetType].byRadius(
        sourceEntity.position,
        interaction.maxDistance,
      );

      for (const targetEntity of potentialTargets) {
        if (sourceEntity.id === targetEntity.id) {
          continue;
        }

        const distance = calculateWrappedDistance(
          sourceEntity.position,
          targetEntity.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );

        if (distance <= interaction.maxDistance) {
          if (interaction.checker(sourceEntity, targetEntity, context)) {
            interaction.perform(sourceEntity, targetEntity, context);
          }
        }
      }
    }
  }
}
