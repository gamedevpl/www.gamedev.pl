import { InteractionDefinition } from './interactions-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
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

export const preyChildFeedingInteraction: InteractionDefinition<PreyEntity, PreyEntity> = {
  id: 'preyChildFeeding',
  sourceType: 'prey', // Female parent
  targetType: 'prey', // Child
  maxDistance: ANIMAL_PARENT_FEEDING_RANGE,
  checker: (parent: PreyEntity, child: PreyEntity): boolean => {
    return (
      parent.isAdult === true &&
      parent.gender === 'female' && // Only females can feed children in animals
      parent.hunger < 80 && // Parent must not be too hungry
      (!parent.feedChildCooldownTime || parent.feedChildCooldownTime <= 0) &&
      child.isAdult === false &&
      (child.motherId === parent.id || child.fatherId === parent.id) &&
      child.hunger >= ANIMAL_CHILD_FEEDING_HUNGER_REDUCTION &&
      parent.activeAction === 'feeding'
    );
  },
  perform: (parent: PreyEntity, child: PreyEntity, context): void => {
    // Female prey feeds by giving some of her own nutrition to child
    parent.hunger = Math.min(120, parent.hunger + 10); // Feeding costs the mother some energy
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