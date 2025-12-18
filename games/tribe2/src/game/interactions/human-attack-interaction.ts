import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  HUMAN_ATTACK_MELEE_RANGE,
  HUMAN_ATTACK_MELEE_COOLDOWN_HOURS,
  HUMAN_ATTACK_MELEE_BUILDUP_HOURS,
  HUMAN_ATTACK_PUSHBACK_FORCE,
  HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
  HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
  HUMAN_ATTACK_MELEE_DAMAGE,
  HUMAN_PARRY_ANGLE_DEGREES,
  HUMAN_PARRY_CHANCE,
  HUMAN_OLD_AGE_THRESHOLD,
  HUMAN_MALE_DAMAGE_MODIFIER,
  HUMAN_CHILD_DAMAGE_MODIFIER,
  HUMAN_VULNERABLE_DAMAGE_MODIFIER,
  HUMAN_ATTACK_RANGED_PUSHBACK_FORCE,
  HUMAN_ATTACK_RANGED_COOLDOWN_HOURS,
  HUMAN_ATTACK_RANGED_RANGE,
  HUMAN_ATTACK_RANGED_DAMAGE,
  HUMAN_ATTACK_RANGED_BUILDUP_HOURS,
  HUMAN_ATTACK_STONE_SPEED,
} from '../human-consts.ts';
import { EFFECT_DURATION_SHORT_HOURS } from '../effect-consts.ts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { HUMAN_ATTACKING, HumanAttackingStateData } from '../entities/characters/human/states/human-state-types';
import {
  getDirectionVectorOnTorus,
  vectorScale,
  vectorAngleBetween,
  vectorNormalize,
  calculateWrappedDistance,
} from '../utils/math-utils';

export const humanAttackInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id: 'human-attack',
  sourceType: 'human',
  targetType: 'human',
  maxDistance: HUMAN_ATTACK_RANGED_RANGE,

  checker: (source, target, context) => {
    if (source.stateMachine?.[0] !== HUMAN_ATTACKING || source.attackTargetId !== target.id) {
      return false;
    }

    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    const isMelee = distance <= HUMAN_ATTACK_MELEE_RANGE;
    const isRanged = !isMelee && distance <= HUMAN_ATTACK_RANGED_RANGE;

    if (!isMelee && !isRanged) {
      return false;
    }

    const cooldown = isMelee ? source.attackCooldown?.melee || 0 : source.attackCooldown?.ranged || 0;
    if (cooldown > 0) {
      return false;
    }

    const buildup = isMelee ? HUMAN_ATTACK_MELEE_BUILDUP_HOURS : HUMAN_ATTACK_RANGED_BUILDUP_HOURS;
    const attackData = source.stateMachine[1] as HumanAttackingStateData;
    const timeSinceAttackStart = context.gameState.time - attackData.attackStartTime;

    return timeSinceAttackStart >= buildup;
  },

  perform: (source, target, context) => {
    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    const isRanged = distance > HUMAN_ATTACK_MELEE_RANGE;

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
      // --- Damage Calculation -----
      let damage = isRanged ? HUMAN_ATTACK_RANGED_DAMAGE : HUMAN_ATTACK_MELEE_DAMAGE;

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

      // Apply movement slowdown
      target.movementSlowdown = {
        modifier: HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
        endTime: context.gameState.time + HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
      };

      addVisualEffect(context.gameState, VisualEffectType.Hit, target.position, EFFECT_DURATION_SHORT_HOURS, target.id);

      // Apply push-back force
      const pushDirection = getDirectionVectorOnTorus(
        source.position,
        target.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      const pushForceAmount = isRanged ? HUMAN_ATTACK_RANGED_PUSHBACK_FORCE : HUMAN_ATTACK_PUSHBACK_FORCE;
      const pushForce = vectorScale(pushDirection, pushForceAmount);
      target.forces.push(pushForce);

      if (target.hitpoints <= 0) {
        // isKilled will be handled in human-update
        playSoundAt(context, SoundType.HumanDeath, target.position);
      } else {
        playSoundAt(context, SoundType.Attack, source.position);
      }
    }

    // Set the attacker's cooldown
    if (isRanged) {
      source.attackCooldown = {
        melee: HUMAN_ATTACK_MELEE_COOLDOWN_HOURS,
        ranged: HUMAN_ATTACK_RANGED_COOLDOWN_HOURS,
      };

      const projectileDuration = distance / HUMAN_ATTACK_STONE_SPEED;
      addVisualEffect(
        context.gameState,
        VisualEffectType.StoneProjectile,
        source.position,
        projectileDuration,
        undefined,
        target.position,
      );
    } else {
      source.attackCooldown = {
        melee: HUMAN_ATTACK_MELEE_COOLDOWN_HOURS,
        ranged: HUMAN_ATTACK_RANGED_COOLDOWN_HOURS,
      };
      // Add visual effect for the attack itself (on the attacker)
      addVisualEffect(
        context.gameState,
        VisualEffectType.Attack,
        source.position,
        EFFECT_DURATION_SHORT_HOURS,
        source.id,
      );
    }

    // Reset the attacker's action to idle after the attack
    const attackData = source.stateMachine![1] as HumanAttackingStateData;
    attackData.attackStartTime = context.gameState.time;
  },
};
