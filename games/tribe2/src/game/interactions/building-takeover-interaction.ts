import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { isEnemyBuilding } from '../utils/human-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { addVisualEffect } from '../utils/visual-effects-utils';

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
    return isEnemyBuilding(source, target, context.gameState);
  },

  perform: (source, target, context) => {
    // Transfer ownership
    target.ownerId = source.id;

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
