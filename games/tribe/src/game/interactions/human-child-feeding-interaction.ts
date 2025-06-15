import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  PARENT_FEEDING_RANGE,
  HUMAN_BERRY_HUNGER_REDUCTION,
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  PARENT_FEED_CHILD_COOLDOWN_HOURS,
  EFFECT_DURATION_SHORT_HOURS,
} from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';

export const humanChildFeedingInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id: 'humanChildFeeding',
  sourceType: 'human', // Parent
  targetType: 'human', // Child
  maxDistance: PARENT_FEEDING_RANGE,
  checker: (parent: HumanEntity, child: HumanEntity): boolean => {
    return (
      parent.isAdult === true &&
      parent.berries > 0 &&
      (!parent.feedChildCooldownTime || parent.feedChildCooldownTime <= 0) &&
      child.isAdult === false &&
      (child.motherId === parent.id || child.fatherId === parent.id) &&
      child.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD
    );
  },
  perform: (parent: HumanEntity, child: HumanEntity, context): void => {
    parent.berries--;
    child.hunger = Math.max(0, child.hunger - HUMAN_BERRY_HUNGER_REDUCTION);
    // Set the cooldown duration in game hours.
    parent.feedChildCooldownTime = PARENT_FEED_CHILD_COOLDOWN_HOURS;

    // Trigger child fed visual effect
    if (!child.lastChildFedEffectTime || context.gameState.time - child.lastChildFedEffectTime > 2) {
      addVisualEffect(
        context.gameState,
        VisualEffectType.ChildFed,
        child.position,
        EFFECT_DURATION_SHORT_HOURS,
        child.id,
      );
      child.lastChildFedEffectTime = context.gameState.time;
    }
    playSoundAt(context, SoundType.ChildFed, child.position);
  },
};
