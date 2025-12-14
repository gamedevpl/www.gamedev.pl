import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PARENT_FEEDING_RANGE, HUMAN_FOOD_HUNGER_REDUCTION } from '../human-consts';
import { EFFECT_DURATION_SHORT_HOURS } from '../effect-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { TribeRole } from '../entities/tribe/tribe-types';
import { MOVER_TRIBE_FEEDING_COOLDOWN_HOURS, MOVER_HUNGRY_MEMBER_THRESHOLD } from '../ai-consts';

/**
 * Interaction for a Mover to feed another tribe member (leader or warrior).
 * Allows Movers to deliver food from storage to tribe members who need it.
 */
export const moverTribeFeedingInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id: 'moverTribeFeeding',
  sourceType: 'human', // Mover
  targetType: 'human', // Leader or Warrior
  maxDistance: PARENT_FEEDING_RANGE,
  checker: (mover: HumanEntity, target: HumanEntity): boolean => {
    // Mover must be an adult with food
    if (!mover.isAdult || mover.food.length === 0) {
      return false;
    }

    // Mover must be in the Mover role
    if (mover.tribeRole !== TribeRole.Mover) {
      return false;
    }

    // Target must be an adult in the same tribe
    if (!target.isAdult || mover.leaderId !== target.leaderId) {
      return false;
    }

    // Target must be leader or warrior
    if (target.tribeRole !== TribeRole.Leader && target.tribeRole !== TribeRole.Warrior) {
      return false;
    }

    // Target must be hungry enough to need food (use consistent threshold with behavior)
    if (target.hunger < MOVER_HUNGRY_MEMBER_THRESHOLD) {
      return false;
    }

    // Mover must be in the tribeFeeding action state
    if (mover.activeAction !== 'tribeFeeding') {
      return false;
    }

    // Check cooldown on mover
    if (mover.tribeFeedingCooldownTime && mover.tribeFeedingCooldownTime > 0) {
      return false;
    }

    return true;
  },
  perform: (mover: HumanEntity, target: HumanEntity, context): void => {
    mover.food.pop();
    target.hunger = Math.max(0, target.hunger - HUMAN_FOOD_HUNGER_REDUCTION);

    // Set cooldown on mover
    mover.tribeFeedingCooldownTime = MOVER_TRIBE_FEEDING_COOLDOWN_HOURS;

    // Visual effect on target
    addVisualEffect(
      context.gameState,
      VisualEffectType.ChildFed, // Reuse the existing fed effect
      target.position,
      EFFECT_DURATION_SHORT_HOURS,
      target.id,
    );
    playSoundAt(context, SoundType.ChildFed, target.position);
  },
};
