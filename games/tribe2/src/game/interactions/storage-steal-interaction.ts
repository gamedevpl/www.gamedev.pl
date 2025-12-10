import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { UpdateContext, DiplomacyStatus } from '../world-types';
import {
  STORAGE_INTERACTION_RANGE,
  STORAGE_STEAL_COOLDOWN,
  STORAGE_STEAL_DETECTION_RANGE,
} from '../storage-spot-consts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { getTribeMembers } from '../utils/family-tribe-utils';
import { calculateWrappedDistance } from '../utils/math-utils';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { HUMAN_GATHERING } from '../entities/characters/human/states/human-state-types';

/**
 * Interaction for stealing food from an enemy storage spot.
 * Allows hostile tribe members to steal food if no defenders are nearby.
 */
export const storageStealInteraction: InteractionDefinition<HumanEntity, BuildingEntity> = {
  id: 'storageSteal',
  sourceType: 'human',
  targetType: 'building',
  maxDistance: STORAGE_INTERACTION_RANGE,

  checker: (source: HumanEntity, target: BuildingEntity, context: UpdateContext): boolean => {
    // Check if target is a storage spot
    if (target.buildingType !== 'storageSpot') {
      return false;
    }

    if (source.stateMachine?.[0] !== HUMAN_GATHERING) {
      return false;
    }

    // Storage must be constructed
    if (!target.isConstructed) {
      return false;
    }

    // Storage must have food to steal
    if (!target.storedFood || target.storedFood.length === 0) {
      return false;
    }

    // Source must have inventory space
    if (source.food.length >= source.maxFood) {
      return false;
    }

    // Source must be from a different tribe
    if (source.leaderId === target.ownerId) {
      return false;
    }

    // Check if tribes are hostile
    const sourceLeader = source.leaderId
      ? (context.gameState.entities.entities[source.leaderId] as HumanEntity | undefined)
      : undefined;

    if (!sourceLeader || !sourceLeader.tribeControl?.diplomacy) {
      // If no diplomacy info, default to not allowing stealing
      return false;
    }

    const diplomacyStatus = sourceLeader.tribeControl.diplomacy[target.ownerId];
    if (diplomacyStatus !== DiplomacyStatus.Hostile) {
      return false;
    }

    // Check cooldown
    const timeSinceLastSteal = context.gameState.time - (target.lastStealTime ?? 0);
    if (timeSinceLastSteal < STORAGE_STEAL_COOLDOWN) {
      return false;
    }

    // Check for nearby defenders (detection risk)
    const defenders = getTribeMembers({ leaderId: target.ownerId } as HumanEntity, context.gameState);

    for (const defender of defenders) {
      const distance = calculateWrappedDistance(
        source.position,
        defender.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      if (distance <= STORAGE_STEAL_DETECTION_RANGE) {
        // Defender nearby - theft detected!
        return false;
      }
    }

    return true;
  },

  perform: (source: HumanEntity, target: BuildingEntity, context: UpdateContext): void => {
    // Ensure storage array exists
    if (!target.storedFood || target.storedFood.length === 0) {
      return;
    }

    // Transfer one food item from storage to thief
    const foodItem = target.storedFood.pop();
    if (foodItem) {
      source.food.push(foodItem.item);
    }

    // Update cooldown timestamp
    target.lastStealTime = context.gameState.time;

    // Play steal sound
    playSoundAt(context, SoundType.StorageSteal, target.position);

    // Add visual effect at the storage location
    addVisualEffect(
      context.gameState,
      VisualEffectType.Attack, // Reuse attack effect for theft indication
      target.position,
      0.5, // Duration in hours
    );
  },
};
