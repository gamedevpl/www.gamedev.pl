import { InteractionDefinition } from './interactions-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import {
  PREY_INTERACTION_RANGE
} from '../animal-consts.ts';
import {
  EFFECT_DURATION_SHORT_HOURS
} from '../effect-consts.ts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';

/**
 * Interaction for prey procreation.
 * Adult prey can procreate when conditions are met.
 */
export const preyProcreationInteraction: InteractionDefinition<PreyEntity, PreyEntity> = {
  id: 'prey-procreation',
  sourceType: 'prey',
  targetType: 'prey',
  maxDistance: PREY_INTERACTION_RANGE,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  checker: (prey1, prey2, _context) => {
    return !!(
      prey1.isAdult &&
      prey2.isAdult &&
      prey1.gender !== prey2.gender && // Different genders
      prey1.id !== prey2.id && // Different entities
      !prey1.isPregnant &&
      !prey2.isPregnant &&
      prey1.hunger < 200 && // Very lenient for debugging
      prey2.hunger < 200 &&
      (!prey1.procreationCooldown || prey1.procreationCooldown <= 0) &&
      (!prey2.procreationCooldown || prey2.procreationCooldown <= 0)
    );
  },

  perform: (prey1, prey2, context) => {
    // Determine which prey becomes pregnant (the female)
    const female = prey1.gender === 'female' ? prey1 : prey2;

    // Make female pregnant
    female.isPregnant = true;
    female.gestationTime = context.gameState.ecosystem.preyGestationPeriod;

    // Set cooldowns for both
    prey1.procreationCooldown = context.gameState.ecosystem.preyProcreationCooldown;
    prey2.procreationCooldown = context.gameState.ecosystem.preyProcreationCooldown;

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
