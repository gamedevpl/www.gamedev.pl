import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { isEnemyBuilding } from '../utils/human-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { takeOverTerrainOwnership, checkTakeoverContiguity } from '../entities/tribe/territory-utils';
import { TERRITORY_BUILDING_RADIUS } from '../entities/tribe/territory-consts';

export const buildingTakeoverInteraction: InteractionDefinition<HumanEntity, BuildingEntity> = {
  id: 'human-takeover-building',
  sourceType: 'human',
  targetType: 'building',
  maxDistance: 20,

  checker: (source, target, context) => {
    // Only leaders can take over buildings
    if (source.leaderId !== source.id) {
      return false;
    }

    // Must be actively trying to take over
    if (source.activeAction !== 'takingOverBuilding') {
      return false;
    }

    // Must be an enemy building
    if (!isEnemyBuilding(source, target, context.gameState)) {
      return false;
    }

    // Check if the takeover would maintain territory contiguity
    const contiguityCheck = checkTakeoverContiguity(
      target.position,
      TERRITORY_BUILDING_RADIUS,
      source.id,
      context.gameState,
    );

    if (!contiguityCheck.valid) {
      return false;
    }

    return true;
  },

  perform: (source, target, context) => {
    // Transfer ownership
    target.ownerId = source.id;

    // Paint the territory to reflect new ownership (overwrite previous owner)
    // Pass target.id as ignoreBuildingId to allow painting under the captured building
    takeOverTerrainOwnership(
      target.position,
      TERRITORY_BUILDING_RADIUS,
      source.id,
      context.gameState,
      target.id,
    );

    // Reset/Repair the building fully
    target.constructionProgress = 1;
    target.isConstructed = true;
    target.isBeingDestroyed = false;
    target.destructionProgress = 0;

    // Reset action
    source.activeAction = 'idle';

    // Visual feedback
    addVisualEffect(
      context.gameState,
      VisualEffectType.BushClaimed,
      target.position,
      2, // duration
      target.id,
    );
  },
};
