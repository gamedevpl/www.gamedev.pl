import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { UpdateContext } from '../world-types';
import { STORAGE_INTERACTION_RANGE, STORAGE_RETRIEVE_COOLDOWN } from '../storage-spot-consts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { HUMAN_RETRIEVING } from '../entities/characters/human/states/human-state-types';
import { calculateStorageFoodPosition } from '../utils/storage-utils';
import { getTribeLeaderForCoordination, removeTribalStorageTask } from '../utils/tribe-task-utils';

/**
 * Interaction for retrieving food from a storage spot.
 * Allows tribe members to withdraw stored food when needed.
 */
export const storageRetrieveInteraction: InteractionDefinition<HumanEntity, BuildingEntity> = {
  id: 'storageRetrieve',
  sourceType: 'human',
  targetType: 'building',
  maxDistance: STORAGE_INTERACTION_RANGE,

  checker: (source: HumanEntity, target: BuildingEntity, context: UpdateContext): boolean => {
    // Check if target is a storage spot
    if (target.buildingType !== 'storageSpot') {
      return false;
    }

    if (source.stateMachine?.[0] !== HUMAN_RETRIEVING) {
      return false;
    }

    // Storage must be constructed
    if (!target.isConstructed) {
      return false;
    }

    // Storage must have food to retrieve
    if (!target.storedFood || target.storedFood.length === 0) {
      return false;
    }

    // Source must have inventory space
    if (source.food.length >= source.maxFood) {
      return false;
    }

    // Source must be a tribe member (same leader)
    if (source.leaderId !== target.ownerId) {
      return false;
    }

    // Check cooldown
    const timeSinceLastRetrieve = context.gameState.time - (target.lastRetrieveTime ?? 0);
    if (timeSinceLastRetrieve < STORAGE_RETRIEVE_COOLDOWN) {
      return false;
    }

    return true;
  },

  perform: (source: HumanEntity, target: BuildingEntity, context: UpdateContext): void => {
    // Ensure storage array exists
    if (!target.storedFood || target.storedFood.length === 0) {
      return;
    }

    // Transfer one food item from storage to source
    const foodItem = target.storedFood.pop();
    if (foodItem) {
      source.food.push(foodItem.item);

      // Recalculate positions for remaining stored items
      calculateStorageFoodPosition(target);
    }

    // Update cooldown timestamp
    target.lastRetrieveTime = context.gameState.time;

    // Play retrieve sound
    playSoundAt(context, SoundType.StorageRetrieve, target.position);

    // Check if the retrieve sequence is complete for this agent
    const isComplete = source.food.length >= source.maxFood || target.storedFood.length === 0;

    if (isComplete) {
      // Free up the storage task slot
      const leader = getTribeLeaderForCoordination(source, context.gameState);
      if (leader) {
        removeTribalStorageTask(leader, target.id, source.id);
      }
    }
  },
};
