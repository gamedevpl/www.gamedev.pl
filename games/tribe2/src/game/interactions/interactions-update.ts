import { UpdateContext } from '../world-types';
import { interactionsDefinitions } from './index';
import { calculateWrappedDistanceSq } from '../utils/math-utils';
import { IndexedWorldState } from '../world-index/world-index-types';
import { InteractionDefinition } from './interactions-types';
import { EntityType } from '../entities/entities-types';

interface InteractionMetadata extends InteractionDefinition {
  maxDistanceSq: number;
  isCollision: boolean;
}

interface InteractionGroup {
  sourceType: EntityType;
  targetType: EntityType;
  maxDistance: number;
  interactions: InteractionMetadata[];
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

    const metadata: InteractionMetadata = {
      ...interaction,
      maxDistanceSq: interaction.maxDistance * interaction.maxDistance,
      isCollision: interaction.id.toLowerCase().includes('collision') ?? false,
    };

    groups[key].interactions.push(metadata);
    groups[key].maxDistance = Math.max(groups[key].maxDistance, interaction.maxDistance);

    return groups;
  }, {} as Record<string, InteractionGroup>),
);

let interactionFrameCounter = 0;

/**
 * Updates all entity interactions in the game world.
 * Optimized to use grouped interactions, spatial indexing, squared distances, and throttling.
 */
export function interactionsUpdate(context: UpdateContext): void {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;
  const { width: mapWidth, height: mapHeight } = gameState.mapDimensions;

  interactionFrameCounter++;
  const isThrottledFrame = interactionFrameCounter % 2 === 0;

  for (let g = 0; g < interactionsDefinitionsGroups.length; g++) {
    const group = interactionsDefinitionsGroups[g];
    // Get all entities that can be the source of interactions in this group
    const sourceEntities = indexedState.search[group.sourceType].all();

    for (let i = 0; i < sourceEntities.length; i++) {
      const sourceEntity = sourceEntities[i];
      // Find potential targets within the maximum distance required by any interaction in the group
      const potentialTargets = indexedState.search[group.targetType].byRadius(sourceEntity.position, group.maxDistance);

      for (let j = 0; j < potentialTargets.length; j++) {
        const targetEntity = potentialTargets[j];
        // Entities cannot interact with themselves
        if (sourceEntity.id === targetEntity.id) {
          continue;
        }

        // Calculate squared distance once per source-target pair
        const distanceSq = calculateWrappedDistanceSq(
          sourceEntity.position,
          targetEntity.position,
          mapWidth,
          mapHeight,
        );

        // Check each interaction in the group
        for (let k = 0; k < group.interactions.length; k++) {
          const interaction = group.interactions[k];

          // Throttling: run non-collision interactions every other frame
          if (!interaction.isCollision && isThrottledFrame) {
            continue;
          }

          if (distanceSq <= interaction.maxDistanceSq) {
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
