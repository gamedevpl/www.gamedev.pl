import { UpdateContext } from '../world-types';
import { interactionsDefinitions } from './index';
import { calculateWrappedDistance } from '../utils/math-utils';
import { IndexedWorldState } from '../world-index/world-index-types';
import { InteractionDefinition } from './interactions-types';
import { EntityType } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity, BuildingType } from '../entities/buildings/building-types';
import { STORAGE_INTERACTION_RANGE } from '../entities/buildings/storage-spot-consts.ts';
import { BONFIRE_FUEL_PER_WOOD } from '../temperature/temperature-consts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';

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

  // Handle Human-specific active actions (like refueling)
  const humans = indexedState.search.human.all() as HumanEntity[];
  humans.forEach((human) => {
    if (human.activeAction === 'refueling' && human.target) {
      const targetEntity = gameState.entities.entities[human.target as any] as BuildingEntity;
      if (
        targetEntity &&
        targetEntity.type === 'building' &&
        targetEntity.buildingType === BuildingType.Bonfire
      ) {
        const distance = calculateWrappedDistance(human.position, targetEntity.position, mapWidth, mapHeight);
        if (distance <= STORAGE_INTERACTION_RANGE) {
          // Refuel logic
          if (targetEntity.fuelLevel !== undefined && targetEntity.maxFuelLevel !== undefined) {
            targetEntity.fuelLevel = Math.min(
              targetEntity.fuelLevel + BONFIRE_FUEL_PER_WOOD,
              targetEntity.maxFuelLevel
            );
            
            human.heldItem = undefined;
            human.activeAction = 'idle';
            human.target = undefined;
            
            playSoundAt(context, SoundType.StorageDeposit, human.position);
          }
        }
      }
    }
  });

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
