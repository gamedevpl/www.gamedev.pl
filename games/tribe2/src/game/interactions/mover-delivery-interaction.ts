import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { MOVER_DELIVERY_RANGE, MOVER_OWN_FOOD_RESERVE } from '../entities/tribe/tribe-delivery-utils';
import { TribeRole } from '../entities/tribe/tribe-types';
import { EFFECT_DURATION_SHORT_HOURS } from '../effect-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';

/**
 * Interaction for MOVERs delivering food to tribe members.
 * MOVERs can deliver food to any tribe member who needs it.
 */
export const moverDeliveryInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id: 'moverDelivery',
  sourceType: 'human', // MOVER
  targetType: 'human', // Tribe member in need
  maxDistance: MOVER_DELIVERY_RANGE,

  checker: (mover: HumanEntity, target: HumanEntity): boolean => {
    // Source must be an adult mover
    if (!mover.isAdult) {
      return false;
    }

    // Source must be a mover role
    if (mover.tribeRole !== TribeRole.Mover) {
      return false;
    }

    // Mover must be actively delivering
    if (mover.activeAction !== 'delivering') {
      return false;
    }

    // Must have excess food to deliver
    if (mover.food.length <= MOVER_OWN_FOOD_RESERVE) {
      return false;
    }

    // Must be in the same tribe
    if (!mover.leaderId || mover.leaderId !== target.leaderId) {
      return false;
    }

    // Target must not be the mover themselves
    if (mover.id === target.id) {
      return false;
    }

    // Target must have inventory space
    if (target.food.length >= target.maxFood) {
      return false;
    }

    return true;
  },

  perform: (mover: HumanEntity, target: HumanEntity, context): void => {
    // Transfer one food item from mover to target
    const foodItem = mover.food.pop();
    if (foodItem) {
      target.food.push(foodItem);

      // Show visual effect on target receiving food
      addVisualEffect(
        context.gameState,
        VisualEffectType.ChildFed, // Reuse child fed effect for delivery (could create a new effect)
        target.position,
        EFFECT_DURATION_SHORT_HOURS,
        target.id,
      );
    }
  },
};
