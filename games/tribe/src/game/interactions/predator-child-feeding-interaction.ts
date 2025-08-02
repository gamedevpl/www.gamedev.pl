import { InteractionDefinition } from './interactions-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import {
  ANIMAL_PARENT_FEEDING_RANGE,
  ANIMAL_CHILD_FEEDING_HUNGER_REDUCTION,
  ANIMAL_FEED_CHILD_COOLDOWN_HOURS
} from '../animal-consts.ts';
import {
  EFFECT_DURATION_SHORT_HOURS
} from '../effect-consts.ts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';

export const predatorChildFeedingInteraction: InteractionDefinition<PredatorEntity, PredatorEntity> = {
  id: 'predatorChildFeeding',
  sourceType: 'predator', // Female parent
  targetType: 'predator', // Child
  maxDistance: ANIMAL_PARENT_FEEDING_RANGE,
  checker: (parent: PredatorEntity, child: PredatorEntity): boolean => {
    return (
      parent.isAdult === true &&
      parent.gender === 'female' && // Only females can feed children in animals
      parent.hunger < 90 && // Parent must not be too hungry (predators have different hunger threshold)
      (!parent.feedChildCooldownTime || parent.feedChildCooldownTime <= 0) &&
      child.isAdult === false &&
      (child.motherId === parent.id || child.fatherId === parent.id) &&
      child.hunger >= ANIMAL_CHILD_FEEDING_HUNGER_REDUCTION &&
      parent.activeAction === 'feeding'
    );
  },
  perform: (parent: PredatorEntity, child: PredatorEntity, context): void => {
    // Female predator feeds by giving some of her own nutrition to child
    parent.hunger = Math.min(140, parent.hunger + 15); // Feeding costs the mother more energy (predators have higher hunger death threshold)
    child.hunger = Math.max(0, child.hunger - ANIMAL_CHILD_FEEDING_HUNGER_REDUCTION);
    
    // Set the cooldown duration in game hours.
    parent.feedChildCooldownTime = ANIMAL_FEED_CHILD_COOLDOWN_HOURS;

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