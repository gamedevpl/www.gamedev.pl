import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { UpdateContext } from '../world-types';
import { STORAGE_INTERACTION_RANGE, STORAGE_DEPOSIT_COOLDOWN } from '../entities/buildings/storage-spot-consts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { HUMAN_DEPOSITING } from '../entities/characters/human/states/human-state-types';
import { calculateStorageItemPosition } from '../utils/storage-utils';
import { Item } from '../entities/item-types';
import { FoodItem } from '../entities/food-types';

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

    // Source must have food or a held item (like wood) to deposit
    if (source.food.length === 0 && !source.heldItem) {
      return false;
    }

    // Check storage capacity
    const capacity = target.storageCapacity ?? 0;
    if (target.storedItems.length >= capacity) {
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
    // Transfer one item from source to storage (prioritize held item)
    let itemToStore: FoodItem | Item | null = null;
    if (source.heldItem) {
      itemToStore = source.heldItem;
      source.heldItem = undefined;
    } else {
      itemToStore = source.food.pop() ?? null;
    }

    if (itemToStore) {
      target.storedItems.push({
        item: itemToStore,
        positionOffset: calculateStorageItemPosition(target),
      });
    }

    // Update cooldown timestamp
    target.lastDepositTime = context.gameState.time;

    // Play deposit sound
    playSoundAt(context, SoundType.StorageDeposit, target.position);
  },
};
