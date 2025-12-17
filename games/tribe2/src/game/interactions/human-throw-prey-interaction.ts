import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
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
 * Interaction for humans throwing stones at prey.
 * This is a ranged attack that requires the human to stop and has a longer cooldown.
 * Helps with hunting prey from a distance.
 */
export const humanThrowPreyInteraction: InteractionDefinition<HumanEntity, PreyEntity> = {
  id: 'human-throw-prey',
  sourceType: 'human',
  targetType: 'prey',
  maxDistance: HUMAN_THROW_RANGE,

  checker: (human, prey, context) => {
    // Must be in throwing state with this specific target
    if (human.stateMachine?.[0] !== HUMAN_THROWING || human.throwTargetId !== prey.id) {
      return false;
    }

    // Check throw cooldown
    if (human.throwCooldown && human.throwCooldown > 0) {
      return false;
    }

    // Target must be alive and human must be adult
    if (prey.hitpoints <= 0 || !human.isAdult) {
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

  perform: (human, prey, context) => {
    // Calculate damage
    let damage = HUMAN_THROW_DAMAGE;

    // Male damage modifier (males throw harder)
    if (human.gender === 'male') {
      damage *= HUMAN_THROW_MALE_DAMAGE_MODIFIER;
    }

    // Deal damage to prey
    prey.hitpoints -= damage;

    // Apply pushback force to prey (less than melee)
    const pushDirection = getDirectionVectorOnTorus(
      human.position,
      prey.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, HUMAN_THROW_PUSHBACK_FORCE);
    prey.forces.push(pushForce);

    // Set throw cooldown (longer than melee attack)
    human.throwCooldown = HUMAN_THROW_COOLDOWN_HOURS;

    // Add stone throw visual effect from human to prey
    addVisualEffect(
      context.gameState,
      VisualEffectType.StoneThrow,
      human.position,
      EFFECT_DURATION_SHORT_HOURS,
      prey.id, // Attach to prey to show where it lands
    );

    // If prey is killed
    if (prey.hitpoints <= 0) {
      playSoundAt(context, SoundType.Attack, prey.position);
      addVisualEffect(context.gameState, VisualEffectType.Hit, prey.position, EFFECT_DURATION_SHORT_HOURS, prey.id);
    } else {
      // Prey survives - hit effect and make it flee
      addVisualEffect(context.gameState, VisualEffectType.Hit, prey.position, EFFECT_DURATION_SHORT_HOURS, prey.id);

      // Set prey flee cooldown (longer than from melee since it's more startling)
      prey.fleeCooldown = 10; // 10 hours of fleeing from humans after being hit by stone

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
