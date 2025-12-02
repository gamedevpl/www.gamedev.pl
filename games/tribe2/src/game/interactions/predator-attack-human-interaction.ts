import { InteractionDefinition } from './interactions-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  PREDATOR_ATTACK_RANGE,
  PREDATOR_ATTACK_DAMAGE,
  PREDATOR_ATTACK_COOLDOWN_HOURS,
  PREDATOR_MEAT_HUNGER_REDUCTION
} from '../animal-consts.ts';
import {
  EFFECT_DURATION_SHORT_HOURS
} from '../effect-consts.ts';
import {
  HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
  HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS
} from '../human-consts.ts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { getDirectionVectorOnTorus, vectorScale } from '../utils/math-utils';

/**
 * Interaction for predators attacking humans.
 * Predators will attack humans when threatened or very hungry.
 */
export const predatorAttackHumanInteraction: InteractionDefinition<PredatorEntity, HumanEntity> = {
  id: 'predator-attack-human',
  sourceType: 'predator',
  targetType: 'human',
  maxDistance: PREDATOR_ATTACK_RANGE,

  checker: (predator, human, context) => {
    return !!(
      predator.isAdult &&
      (!predator.attackCooldown || predator.attackCooldown <= 0) &&
      human.hitpoints > 0 && // Target must be alive
      (
        predator.hunger > 100 || // Very hungry predators attack humans
        human.attackTargetId === predator.id || // Retaliate if human is attacking this predator
        (human.attackTargetId && context.gameState.entities.entities.get(human.attackTargetId)?.type === 'predator') // Defend other predators
      )
    );
  },

  perform: (predator, human, context) => {
    // Calculate damage (predators are stronger than humans)
    let damage = PREDATOR_ATTACK_DAMAGE;
    
    // Extra damage if predator is desperate (very hungry)
    if (predator.hunger > 120) {
      damage *= 1.3; // 30% more damage when desperate
    }

    // Deal damage to human
    human.hitpoints -= damage;

    // Apply movement slowdown to human
    human.movementSlowdown = {
      modifier: HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
      endTime: context.gameState.time + HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
    };

    // Apply pushback force to human
    const pushDirection = getDirectionVectorOnTorus(
      predator.position,
      human.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, 7); // Strong pushback
    human.forces.push(pushForce);

    // Set attack cooldown
    predator.attackCooldown = PREDATOR_ATTACK_COOLDOWN_HOURS;

    // If human is killed, predator gets fed
    if (human.hitpoints <= 0) {
      predator.hunger = Math.max(0, predator.hunger - PREDATOR_MEAT_HUNGER_REDUCTION);
      
      // Play death sound
      playSoundAt(context, SoundType.HumanDeath, human.position);
      
      // Add hit effect on human
      addVisualEffect(context.gameState, VisualEffectType.Hit, human.position, EFFECT_DURATION_SHORT_HOURS, human.id);
    } else {
      // Human survives, add hit effect
      addVisualEffect(context.gameState, VisualEffectType.Hit, human.position, EFFECT_DURATION_SHORT_HOURS, human.id);
      
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