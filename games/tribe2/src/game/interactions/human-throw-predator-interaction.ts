import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import {
  HUMAN_THROW_RANGE,
  HUMAN_THROW_DAMAGE,
  HUMAN_THROW_COOLDOWN_HOURS,
  HUMAN_THROW_BUILDUP_HOURS,
  HUMAN_THROW_MALE_DAMAGE_MODIFIER,
  HUMAN_THROW_PUSHBACK_FORCE,
} from '../human-consts.ts';
import { EFFECT_DURATION_SHORT_HOURS } from '../effect-consts.ts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { getDirectionVectorOnTorus, vectorScale } from '../utils/math-utils';
import { HUMAN_THROWING, HumanThrowingStateData } from '../entities/characters/human/states/human-state-types';

/**
 * Interaction for humans throwing stones at predators.
 * This is a ranged attack that requires the human to stop and has a longer cooldown.
 * Useful for defending against predators from a distance.
 */
export const humanThrowPredatorInteraction: InteractionDefinition<HumanEntity, PredatorEntity> = {
  id: 'human-throw-predator',
  sourceType: 'human',
  targetType: 'predator',
  maxDistance: HUMAN_THROW_RANGE,

  checker: (human, predator, context) => {
    // Must be in throwing state with this specific target
    if (human.stateMachine?.[0] !== HUMAN_THROWING || human.throwTargetId !== predator.id) {
      return false;
    }

    // Check throw cooldown
    if (human.throwCooldown && human.throwCooldown > 0) {
      return false;
    }

    // Target must be alive and human must be adult
    if (predator.hitpoints <= 0 || !human.isAdult) {
      return false;
    }

    // Check if enough time has passed since throw started (windup time)
    const throwData = human.stateMachine[1] as HumanThrowingStateData;
    const timeSinceThrowStart = context.gameState.time - throwData.throwStartTime;

    // Human must have been in throwing state for the buildup duration
    if (timeSinceThrowStart < HUMAN_THROW_BUILDUP_HOURS) {
      return false;
    }

    // Human must be stationary to throw (acceleration = 0 means stopped)
    if (human.acceleration !== 0) {
      return false;
    }

    return true;
  },

  perform: (human, predator, context) => {
    // Calculate damage (less effective against predators than prey)
    let damage = HUMAN_THROW_DAMAGE * 0.8; // 20% less effective against predators

    // Male damage modifier (males throw harder)
    if (human.gender === 'male') {
      damage *= HUMAN_THROW_MALE_DAMAGE_MODIFIER;
    }

    // Deal damage to predator
    predator.hitpoints -= damage;

    // Apply pushback force to predator
    const pushDirection = getDirectionVectorOnTorus(
      human.position,
      predator.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, HUMAN_THROW_PUSHBACK_FORCE);
    predator.forces.push(pushForce);

    // Set throw cooldown (longer than melee attack)
    human.throwCooldown = HUMAN_THROW_COOLDOWN_HOURS;

    // Add stone throw visual effect from human to predator
    addVisualEffect(
      context.gameState,
      VisualEffectType.StoneThrow,
      human.position,
      EFFECT_DURATION_SHORT_HOURS,
      predator.id, // Attach to predator to show where it lands
    );

    // If predator is killed
    if (predator.hitpoints <= 0) {
      playSoundAt(context, SoundType.Attack, predator.position);
      addVisualEffect(context.gameState, VisualEffectType.Hit, predator.position, EFFECT_DURATION_SHORT_HOURS, predator.id);
    } else {
      // Predator survives - hit effect
      addVisualEffect(context.gameState, VisualEffectType.Hit, predator.position, EFFECT_DURATION_SHORT_HOURS, predator.id);

      // Wounded predators might become more desperate and aggressive
      if (predator.hitpoints < predator.maxHitpoints * 0.3) {
        predator.hunger += 10; // Desperation increases hunger drive
      }

      playSoundAt(context, SoundType.Attack, human.position);
    }

    // Add attack effect on human
    addVisualEffect(
      context.gameState,
      VisualEffectType.Attack,
      human.position,
      EFFECT_DURATION_SHORT_HOURS,
      human.id,
    );

    // Reset action after throw completes
    human.activeAction = 'idle';
    human.throwTargetId = undefined;
  },
};
