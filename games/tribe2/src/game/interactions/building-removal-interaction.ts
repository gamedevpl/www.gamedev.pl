import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { isEnemyBuilding } from '../utils/human-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { addVisualEffect } from '../utils/visual-effects-utils';

export const buildingRemovalInteraction: InteractionDefinition<HumanEntity, BuildingEntity> = {
  id: 'human-remove-enemy-building',
  sourceType: 'human',
  targetType: 'building',
  maxDistance: 20,

  checker: (source, target, context) => {
    // Case 1: Dismantling friendly building (Cleanup)
    if (source.activeAction === 'dismantling') {
      // Must be same tribe
      if (source.leaderId !== target.ownerId) {
        return false;
      }
      // Don't trigger if already being destroyed
      if (target.isBeingDestroyed) {
        return false;
      }
      return true;
    }

    // Case 2: Destroying enemy building (Warfare)
    if (source.activeAction === 'destroyingBuilding') {
      // Only leaders can remove enemy buildings
      if (source.leaderId !== source.id) {
        return false;
      }
      // Must be an enemy building
      if (!isEnemyBuilding(source, target, context.gameState)) {
        return false;
      }
      // Don't trigger if already being destroyed
      if (target.isBeingDestroyed) {
        return false;
      }
      return true;
    }

    return false;
  },

  perform: (source, target, context) => {
    // Start destruction
    target.isBeingDestroyed = true;

    // Reset action
    source.activeAction = 'idle';

    // Visual feedback
    addVisualEffect(
      context.gameState,
      VisualEffectType.Hit,
      target.position,
      1, // duration
      target.id,
    );
  },
};
