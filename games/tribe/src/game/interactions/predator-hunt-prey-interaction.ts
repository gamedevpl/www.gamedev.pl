import { InteractionDefinition } from './interactions-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import {
  PREDATOR_HUNT_RANGE,
  PREDATOR_HUNT_DAMAGE,
  PREDATOR_HUNT_COOLDOWN_HOURS,
  EFFECT_DURATION_SHORT_HOURS,
} from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { getDirectionVectorOnTorus, vectorScale } from '../utils/math-utils';

/**
 * Interaction for predators hunting prey.
 * Predators attack prey when hungry, dealing damage and potentially killing them.
 */
export const predatorHuntPreyInteraction: InteractionDefinition<PredatorEntity, PreyEntity> = {
  id: 'predator-hunt-prey',
  sourceType: 'predator',
  targetType: 'prey',
  maxDistance: PREDATOR_HUNT_RANGE,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  checker: (predator, prey, _context) => {
    return !!(
      predator.isAdult &&
      predator.hunger > 50 && // Only hunt when moderately hungry
      (!predator.huntCooldown || predator.huntCooldown <= 0) &&
      prey.hitpoints > 0 // Target must be alive
    );
  },

  perform: (predator, prey, context) => {
    // Deal damage to prey
    prey.hitpoints -= PREDATOR_HUNT_DAMAGE;

    // Apply pushback force to prey
    const pushDirection = getDirectionVectorOnTorus(
      predator.position,
      prey.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, 8); // Stronger than human attacks
    prey.forces.push(pushForce);

    // Set hunt cooldown
    predator.huntCooldown = PREDATOR_HUNT_COOLDOWN_HOURS;

    // If prey is killed, create corpse (meat gathering handled separately)  
    if (prey.hitpoints <= 0) {
      // Play death sound
      playSoundAt(context, SoundType.HumanDeath, prey.position); // Reuse human death sound
      
      // Add hit effect on prey
      addVisualEffect(context.gameState, VisualEffectType.Hit, prey.position, EFFECT_DURATION_SHORT_HOURS, prey.id);
    } else {
      // Prey survives, just add hit effect and make it flee
      addVisualEffect(context.gameState, VisualEffectType.Hit, prey.position, EFFECT_DURATION_SHORT_HOURS, prey.id);
      
      // Set prey flee cooldown to prevent immediate re-fleeing
      prey.fleeCooldown = 5; // 5 hours of fleeing
      
      playSoundAt(context, SoundType.Attack, predator.position);
    }

    // Add attack effect on predator
    addVisualEffect(
      context.gameState,
      VisualEffectType.Attack,
      predator.position,
      EFFECT_DURATION_SHORT_HOURS,
      predator.id,
    );
  },
};