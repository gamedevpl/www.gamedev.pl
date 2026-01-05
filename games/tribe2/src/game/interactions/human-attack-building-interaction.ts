import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { BuildingType } from '../entities/buildings/building-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { HUMAN_ATTACK_MELEE_COOLDOWN_HOURS } from '../human-consts';

/**
 * Interaction for a human attacking an enemy building (Palisade or Gate).
 */
export const humanAttackBuildingInteraction: InteractionDefinition<HumanEntity, BuildingEntity> = {
  id: 'human-attack-building',
  sourceType: 'human',
  targetType: 'building',
  maxDistance: 40, // Melee range

  checker: (source, target, context) => {
    const { gameState } = context;

    // 1. Target must be a Palisade or Gate
    if (target.buildingType !== BuildingType.Palisade && target.buildingType !== BuildingType.Gate) {
      return false;
    }

    // 2. Hostility check: Source and target must have different tribe leaders
    if (!target.ownerId || target.ownerId === source.leaderId) {
      return false;
    }

    // 3. Cooldown check
    if (source.attackCooldown && source.attackCooldown.melee > gameState.time) {
      return false;
    }

    return true;
  },

  perform: (source, target, context) => {
    const { gameState } = context;

    // Start destruction if not already started
    target.isBeingDestroyed = true;

    // Increment destruction progress
    // Palisades and Gates have construction/destruction times, 
    // but here we apply a discrete 'hit' damage.
    const damagePerHit = 0.1; 
    target.destructionProgress = Math.min(1, target.destructionProgress + damagePerHit);

    // Set attack cooldown
    if (!source.attackCooldown) {
      source.attackCooldown = { melee: 0, ranged: 0 };
    }
    source.attackCooldown.melee = gameState.time + HUMAN_ATTACK_MELEE_COOLDOWN_HOURS;

    // Visual effect: Hit spark or dust
    addVisualEffect(gameState, VisualEffectType.Hit, target.position, 0.5, source.id, undefined, target.id);

    // If destructionProgress >= 1, the buildingUpdate logic in building-update.ts 
    // will handle the actual removal of the entity.
  },
};
