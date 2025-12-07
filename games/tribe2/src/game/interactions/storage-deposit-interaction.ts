import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { UpdateContext } from '../world-types';
import { STORAGE_INTERACTION_RANGE, STORAGE_DEPOSIT_COOLDOWN } from '../storage-spot-consts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { HUMAN_DEPOSITING } from '../entities/characters/human/states/human-state-types';
import { calculateStorageFoodPosition } from '../utils/storage-utils';
import { getTribeLeaderForCoordination, removeTribalStorageTask } from '../utils/tribe-task-utils';

/**
 * Interaction for depositing food into a storage spot.
 * Allows tribe members to store excess food for later use.
 */
export const storageDepositInteraction: InteractionDefinition<HumanEntity, BuildingEntity> = {
  id: 'storageDeposit',
  sourceType: 'human',
  targetType: 'building',
  maxDistance: STORAGE_INTERACTION_RANGE,

  checker: (source: HumanEntity, target: BuildingEntity, context: UpdateContext): boolean => {
    // Check if target is a storage spot
    if (target.buildingType !== 'storageSpot') {
      return false;
    }

    if (source.stateMachine?.[0] !== HUMAN_DEPOSITING) {
      return false;
    }

    // Storage must be constructed
    if (!target.isConstructed) {
      return false;
    }

    // Source must have food to deposit
    if (source.food.length === 0) {
      return false;
    }

    // Initialize storage arrays if needed
    if (!target.storedFood) {
      target.storedFood = [];
    }

    // Check storage capacity
    const capacity = target.storageCapacity ?? 0;
    if (target.storedFood.length >= capacity) {
      return false;
    }

    // Source must be a tribe member (same leader)
    if (source.leaderId !== target.ownerId) {
      return false;
    }

    // Check cooldown
    const timeSinceLastDeposit = context.gameState.time - (target.lastDepositTime ?? 0);
    if (timeSinceLastDeposit < STORAGE_DEPOSIT_COOLDOWN) {
      return false;
    }

    return true;
  },

  perform: (source: HumanEntity, target: BuildingEntity, context: UpdateContext): void => {
    // Ensure storage array exists
    if (!target.storedFood) {
      target.storedFood = [];
    }

    // Transfer one food item from source to storage
    const foodItem = source.food.pop();
    if (foodItem) {
      target.storedFood.push({
        item: foodItem,
        positionOffset: calculateStorageFoodPosition(target),
      });
    }

    // Update cooldown timestamp
    target.lastDepositTime = context.gameState.time;

    // Play deposit sound
    playSoundAt(context, SoundType.StorageDeposit, target.position);

    // Check if the deposit sequence is complete for this agent
    const isComplete = source.food.length === 0 || target.storedFood.length >= (target.storageCapacity ?? 0);

    if (isComplete) {
      // Free up the storage task slot
      const leader = getTribeLeaderForCoordination(source, context.gameState);
      if (leader) {
        removeTribalStorageTask(leader, target.id, source.id);
      }
    }
  },
};
