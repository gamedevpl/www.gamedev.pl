import { InteractionDefinition } from './interactions-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { CorpseEntity } from '../entities/characters/corpse-types';
import { PREDATOR_INTERACTION_RANGE, PREDATOR_MEAT_HUNGER_REDUCTION, EFFECT_DURATION_SHORT_HOURS } from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';

/**
 * Interaction for predators eating from corpses.
 * Predators can consume meat from any corpse to reduce their hunger.
 */
export const predatorEatCorpseInteraction: InteractionDefinition<PredatorEntity, CorpseEntity> = {
  id: 'predator-eat-corpse',
  sourceType: 'predator',
  targetType: 'corpse',
  maxDistance: PREDATOR_INTERACTION_RANGE,

  checker: (predator, corpse, context) => {
    return !!(
      predator.isAdult &&
      predator.hunger > 30 && // Only eat when hungry
      corpse.food.length > 0 && // Corpse must have meat
      (!predator.eatingCooldownTime || predator.eatingCooldownTime <= context.gameState.time)
    );
  },

  perform: (predator, corpse, context) => {
    // Consume meat from corpse
    const meatItem = corpse.food.pop();
    if (meatItem) {
      // Reduce hunger
      predator.hunger = Math.max(0, predator.hunger - PREDATOR_MEAT_HUNGER_REDUCTION);
      
      // Set eating cooldown
      predator.eatingCooldownTime = context.gameState.time + 2; // 2 hours cooldown
      
      // Add visual effect
      addVisualEffect(
        context.gameState,
        VisualEffectType.Eating, // Use eating effect for consuming meat
        predator.position,
        EFFECT_DURATION_SHORT_HOURS,
        predator.id,
      );
      
      // Play eating sound
      playSoundAt(context, SoundType.Gather, predator.position); // Reuse gather sound
    }
  },
};