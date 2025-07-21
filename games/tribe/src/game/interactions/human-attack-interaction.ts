import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  HUMAN_ATTACK_RANGE,
  HUMAN_ATTACK_COOLDOWN_HOURS,
  HUMAN_ATTACK_BUILDUP_HOURS,
  HUMAN_ATTACK_PUSHBACK_FORCE,
  EFFECT_DURATION_SHORT_HOURS,
  HUMAN_ATTACK_DAMAGE,
  HUMAN_PARRY_ANGLE_DEGREES,
  HUMAN_PARRY_CHANCE,
  HUMAN_OLD_AGE_THRESHOLD,
  HUMAN_MALE_DAMAGE_MODIFIER,
  HUMAN_CHILD_DAMAGE_MODIFIER,
  HUMAN_VULNERABLE_DAMAGE_MODIFIER,
} from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { HUMAN_ATTACKING, HumanAttackingStateData } from '../entities/characters/human/states/human-state-types';
import { getDirectionVectorOnTorus, vectorScale, vectorAngleBetween, vectorNormalize } from '../utils/math-utils';

export const humanAttackInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id: 'human-attack',
  sourceType: 'human',
  targetType: 'human',
  maxDistance: HUMAN_ATTACK_RANGE,

  checker: (source, target, context) => {
    if (
      source.stateMachine?.[0] !== HUMAN_ATTACKING ||
      source.attackTargetId !== target.id ||
      (source.attackCooldown || 0) > 0
    ) {
      return false;
    }

    const attackData = source.stateMachine[1] as HumanAttackingStateData;
    const timeSinceAttackStart = context.gameState.time - attackData.attackStartTime;

    return timeSinceAttackStart >= HUMAN_ATTACK_BUILDUP_HOURS;
  },

  perform: (source, target, context) => {
    // --- Parry Check --
    const toTarget = getDirectionVectorOnTorus(
      source.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const angle = vectorAngleBetween(vectorNormalize(toTarget), target.direction);
    const isFacing = Math.abs(angle) < (HUMAN_PARRY_ANGLE_DEGREES * Math.PI) / 180;

    if (isFacing && Math.random() < HUMAN_PARRY_CHANCE) {
      // Attack Parried
      addVisualEffect(
        context.gameState,
        VisualEffectType.AttackDeflected,
        target.position,
        EFFECT_DURATION_SHORT_HOURS,
        target.id,
      );
    } else {
      // --- Damage Calculation ---
      let damage = HUMAN_ATTACK_DAMAGE;

      // Male damage modifier
      if (source.gender === 'male') {
        damage *= HUMAN_MALE_DAMAGE_MODIFIER;
      }

      // Child damage modifier
      if (!source.isAdult) {
        damage *= HUMAN_CHILD_DAMAGE_MODIFIER;
      }

      // Vulnerability modifier (children and elders are more vulnerable to adults)
      const isTargetVulnerable = !target.isAdult || target.age >= HUMAN_OLD_AGE_THRESHOLD;
      if (isTargetVulnerable && source.isAdult) {
        damage *= HUMAN_VULNERABLE_DAMAGE_MODIFIER;
      }

      // Attack Hits
      target.hitpoints -= damage;

      addVisualEffect(context.gameState, VisualEffectType.Hit, target.position, EFFECT_DURATION_SHORT_HOURS, target.id);

      // Apply push-back force
      const pushDirection = getDirectionVectorOnTorus(
        source.position,
        target.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      const pushForce = vectorScale(pushDirection, HUMAN_ATTACK_PUSHBACK_FORCE);
      target.forces.push(pushForce);

      if (target.hitpoints <= 0) {
        // isKilled will be handled in human-update
        playSoundAt(context, SoundType.HumanDeath, target.position);
      } else {
        playSoundAt(context, SoundType.Attack, source.position);
      }
    }

    // Set the attacker's cooldown
    source.attackCooldown = HUMAN_ATTACK_COOLDOWN_HOURS;
    // Reset the attacker's action to idle after the attack
    const attackData = source.stateMachine![1] as HumanAttackingStateData;
    attackData.attackStartTime = context.gameState.time;

    // Add visual effect for the attack itself (on the attacker)
    addVisualEffect(
      context.gameState,
      VisualEffectType.Attack,
      source.position,
      EFFECT_DURATION_SHORT_HOURS,
      source.id,
    );
  },
};
