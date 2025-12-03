import { InteractionDefinition } from './interactions-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import {
  PREDATOR_ATTACK_RANGE,
  PREDATOR_ATTACK_DAMAGE,
  PREDATOR_ATTACK_COOLDOWN_HOURS,
  PREDATOR_MEAT_HUNGER_REDUCTION,
} from '../animal-consts.ts';
import { EFFECT_DURATION_SHORT_HOURS } from '../effect-consts.ts';
import {
  HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
  HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
} from '../human-consts.ts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { getDirectionVectorOnTorus, vectorScale } from '../utils/math-utils';

/**
 * Interaction for predators attacking other predators.
 */
export const predatorAttackRivalInteraction: InteractionDefinition<PredatorEntity, PredatorEntity> = {
  id: 'predator-attack-rival',
  sourceType: 'predator',
  targetType: 'predator',
  maxDistance: PREDATOR_ATTACK_RANGE,

  checker: (predator, rival, context) => {
    return !!(
      (
        predator.isAdult &&
        (!predator.attackCooldown || predator.attackCooldown <= 0) &&
        rival.hitpoints > 0 && // Target must be alive
        (predator.hunger > 100 || // Very hungry predators attack rivals
          rival.attackTargetId === predator.id || // Retaliate if rival is attacking this predator
          (rival.attackTargetId && context.gameState.entities.entities[rival.attackTargetId]?.type === 'predator'))
      ) // Defend other predators
    );
  },

  perform: (predator, rival, context) => {
    // Calculate damage (predators are stronger than other predators)
    let damage = PREDATOR_ATTACK_DAMAGE;

    // Extra damage if predator is desperate (very hungry)
    if (predator.hunger > 120) {
      damage *= 1.3; // 30% more damage when desperate
    }

    // Deal damage to rival
    rival.hitpoints -= damage;

    // Apply movement slowdown to rival
    rival.movementSlowdown = {
      modifier: HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
      endTime: context.gameState.time + HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
    };

    // Apply pushback force to rival
    const pushDirection = getDirectionVectorOnTorus(
      predator.position,
      rival.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, 7); // Strong pushback
    rival.forces.push(pushForce);

    // Set attack cooldown
    predator.attackCooldown = PREDATOR_ATTACK_COOLDOWN_HOURS;

    // If rival is killed, predator gets fed
    if (rival.hitpoints <= 0) {
      predator.hunger = Math.max(0, predator.hunger - PREDATOR_MEAT_HUNGER_REDUCTION);

      // Play death sound
      playSoundAt(context, SoundType.HumanDeath, rival.position);

      // Add hit effect on rival
      addVisualEffect(context.gameState, VisualEffectType.Hit, rival.position, EFFECT_DURATION_SHORT_HOURS, rival.id);
    } else {
      // Rival survives, add hit effect
      addVisualEffect(context.gameState, VisualEffectType.Hit, rival.position, EFFECT_DURATION_SHORT_HOURS, rival.id);

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
