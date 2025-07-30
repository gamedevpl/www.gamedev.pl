import { InteractionDefinition } from './interactions-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import {
  PREDATOR_INTERACTION_RANGE,
  PREDATOR_GESTATION_PERIOD_HOURS,
  PREDATOR_PROCREATION_COOLDOWN_HOURS,
  EFFECT_DURATION_SHORT_HOURS,
} from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';

/**
 * Interaction for predator procreation.
 * Adult predators can procreate when conditions are met.
 */
export const predatorProcreationInteraction: InteractionDefinition<PredatorEntity, PredatorEntity> = {
  id: 'predator-procreation',
  sourceType: 'predator',
  targetType: 'predator',
  maxDistance: PREDATOR_INTERACTION_RANGE,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  checker: (predator1, predator2, _context) => {
    return !!(
      predator1.isAdult &&
      predator2.isAdult &&
      predator1.gender !== predator2.gender && // Different genders
      predator1.id !== predator2.id && // Different entities
      !predator1.isPregnant &&
      !predator2.isPregnant &&
      predator1.hunger < 90 && // Not too hungry
      predator2.hunger < 90 &&
      (!predator1.procreationCooldown || predator1.procreationCooldown <= 0) &&
      (!predator2.procreationCooldown || predator2.procreationCooldown <= 0)
    );
  },

  perform: (predator1, predator2, context) => {
    // Determine which predator becomes pregnant (the female)
    const female = predator1.gender === 'female' ? predator1 : predator2;

    // Make female pregnant
    female.isPregnant = true;
    female.gestationTime = PREDATOR_GESTATION_PERIOD_HOURS;

    // Set cooldowns for both
    predator1.procreationCooldown = PREDATOR_PROCREATION_COOLDOWN_HOURS;
    predator2.procreationCooldown = PREDATOR_PROCREATION_COOLDOWN_HOURS;

    // Add visual effect
    addVisualEffect(
      context.gameState,
      VisualEffectType.Procreation, // Reuse existing effect
      female.position,
      EFFECT_DURATION_SHORT_HOURS,
      female.id,
    );

    // Play sound
    playSoundAt(context, SoundType.Procreate, female.position);
  },
};