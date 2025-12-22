import { UpdateContext } from '../world-types';
import { interactionsDefinitions } from './index';
import { calculateWrappedDistance } from '../utils/math-utils';
import { IndexedWorldState } from '../world-index/world-index-types';
import { InteractionDefinition } from './interactions-types';
import { EntityType } from '../entities/entities-types';

interface InteractionGroup {
  sourceType: EntityType;
  targetType: EntityType;
  maxDistance: number;
  interactions: InteractionDefinition[];
}

const interactionsDefinitionsGroups = Object.values(
  interactionsDefinitions.reduce((groups, interaction) => {
    const key = `${interaction.sourceType}-${interaction.targetType}`;
    if (!groups[key]) {
      groups[key] = {
        sourceType: interaction.sourceType,
        targetType: interaction.targetType,
        maxDistance: interaction.maxDistance,
        interactions: [],
      };
    }

    groups[key].interactions.push(interaction);
    groups[key].maxDistance = Math.max(groups[key].maxDistance, interaction.maxDistance);

    return groups;
  }, {} as Record<string, InteractionGroup>),
);

/**
 * Updates all entity interactions in the game world.
 * Optimized to use grouped interactions and spatial indexing.
 */
export function interactionsUpdate(context: UpdateContext): void {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;
  const { width: mapWidth, height: mapHeight } = gameState.mapDimensions;

  for (const group of interactionsDefinitionsGroups) {
    // Get all entities that can be the source of interactions in this group
    const sourceEntities = indexedState.search[group.sourceType].all();

    for (const sourceEntity of sourceEntities) {
      // Find potential targets within the maximum distance required by any interaction in the group
      const potentialTargets = indexedState.search[group.targetType].byRadius(sourceEntity.position, group.maxDistance);

      for (const targetEntity of potentialTargets) {
        // Entities cannot interact with themselves
        if (sourceEntity.id === targetEntity.id) {
          continue;
        }

        // Calculate distance once per source-target pair
        const distance = calculateWrappedDistance(sourceEntity.position, targetEntity.position, mapWidth, mapHeight);

        // Check each interaction in the group
        for (const interaction of group.interactions) {
          if (distance <= interaction.maxDistance) {
            // If distance constraints are met, check specific interaction conditions
            if (interaction.checker(sourceEntity, targetEntity, context)) {
              // Perform the interaction effects
              interaction.perform(sourceEntity, targetEntity, context);
            }
          }
        }
      }
    }
  }
}
