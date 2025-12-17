import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  HUMAN_THROW_RANGE,
  HUMAN_THROW_DAMAGE,
  HUMAN_THROW_COOLDOWN_HOURS,
  HUMAN_THROW_BUILDUP_HOURS,
  HUMAN_THROW_MALE_DAMAGE_MODIFIER,
  HUMAN_THROW_PUSHBACK_FORCE,
  HUMAN_OLD_AGE_THRESHOLD,
  HUMAN_CHILD_DAMAGE_MODIFIER,
  HUMAN_VULNERABLE_DAMAGE_MODIFIER,
  HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
  HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
} from '../human-consts.ts';
import { EFFECT_DURATION_SHORT_HOURS } from '../effect-consts.ts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { getDirectionVectorOnTorus, vectorScale } from '../utils/math-utils';
import { HUMAN_THROWING, HumanThrowingStateData } from '../entities/characters/human/states/human-state-types';

/**
 * Interaction for humans throwing stones at other humans.
 * This is a ranged attack that requires the human to stop and has a longer cooldown.
 * Can be used in tribal warfare or conflicts.
 */
export const humanThrowHumanInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id: 'human-throw-human',
  sourceType: 'human',
  targetType: 'human',
  maxDistance: HUMAN_THROW_RANGE,

  checker: (source, target, context) => {
    // Must be in throwing state with this specific target
    if (source.stateMachine?.[0] !== HUMAN_THROWING || source.throwTargetId !== target.id) {
      return false;
    }

    // Check throw cooldown
    if (source.throwCooldown && source.throwCooldown > 0) {
      return false;
    }

    // Target must be alive
    if (target.hitpoints <= 0) {
      return false;
    }

    // Check if enough time has passed since throw started (windup time)
    const throwData = source.stateMachine[1] as HumanThrowingStateData;
    const timeSinceThrowStart = context.gameState.time - throwData.throwStartTime;

    // Human must have been in throwing state for the buildup duration
    if (timeSinceThrowStart < HUMAN_THROW_BUILDUP_HOURS) {
      return false;
    }

    // Human must be stationary to throw (acceleration = 0 means stopped)
    if (source.acceleration !== 0) {
      return false;
    }

    return true;
  },

  perform: (source, target, context) => {
    // Calculate damage
    let damage = HUMAN_THROW_DAMAGE;

    // Male damage modifier (males throw harder)
    if (source.gender === 'male') {
      damage *= HUMAN_THROW_MALE_DAMAGE_MODIFIER;
    }

    // Child damage modifier (children throw weaker)
    if (!source.isAdult) {
      damage *= HUMAN_CHILD_DAMAGE_MODIFIER;
    }

    // Vulnerability modifier (children and elders are more vulnerable)
    const isTargetVulnerable = !target.isAdult || target.age >= HUMAN_OLD_AGE_THRESHOLD;
    if (isTargetVulnerable && source.isAdult) {
      damage *= HUMAN_VULNERABLE_DAMAGE_MODIFIER;
    }

    // Deal damage to target
    target.hitpoints -= damage;

    // Apply pushback force to target
    const pushDirection = getDirectionVectorOnTorus(
      source.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, HUMAN_THROW_PUSHBACK_FORCE);
    target.forces.push(pushForce);

    // Apply movement slowdown to target
    target.movementSlowdown = {
      modifier: HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
      endTime: context.gameState.time + HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
    };

    // Set throw cooldown (longer than melee attack)
    source.throwCooldown = HUMAN_THROW_COOLDOWN_HOURS;

    // Add stone throw visual effect from source to target
    addVisualEffect(
      context.gameState,
      VisualEffectType.StoneThrow,
      source.position,
      EFFECT_DURATION_SHORT_HOURS,
      target.id, // Attach to target to show where it lands
    );

    // Add hit effect on target
    addVisualEffect(context.gameState, VisualEffectType.Hit, target.position, EFFECT_DURATION_SHORT_HOURS, target.id);

    // If target is killed
    if (target.hitpoints <= 0) {
      playSoundAt(context, SoundType.HumanDeath, target.position);
    } else {
      playSoundAt(context, SoundType.Attack, source.position);
    }

    // Add attack effect on source
    addVisualEffect(
      context.gameState,
      VisualEffectType.Attack,
      source.position,
      EFFECT_DURATION_SHORT_HOURS,
      source.id,
    );

    // Reset action after throw completes
    source.activeAction = 'idle';
    source.throwTargetId = undefined;
  },
};
