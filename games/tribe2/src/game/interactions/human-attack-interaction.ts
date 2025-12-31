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
    if (source.stateMachine[0] !== HUMAN_ATTACKING || source.attackTargetId !== target.id) {
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
    const { gameState } = context;

    const distance = calculateWrappedDistance(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    const isRanged = distance > HUMAN_ATTACK_MELEE_RANGE;

    // --- Parry Check --
    const toTarget = getDirectionVectorOnTorus(
      source.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    const angle = vectorAngleBetween(vectorNormalize(toTarget), target.direction);
    const isFacing = Math.abs(angle) < (HUMAN_PARRY_ANGLE_DEGREES * Math.PI) / 180;

    if (isFacing && Math.random() < HUMAN_PARRY_CHANCE) {
      // Attack Parried
      addVisualEffect(
        gameState,
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

      if (isRanged) {
        const projectileDuration = distance / HUMAN_ATTACK_STONE_SPEED;

        // Schedule Ranged Impact
        gameState.scheduledEvents.push({
          id: gameState.nextScheduledEventId++,
          type: 'ranged-impact',
          scheduledTime: gameState.time + projectileDuration,
          data: {
            attackerId: source.id,
            targetId: target.id,
            damage,
            pushbackForce: HUMAN_ATTACK_RANGED_PUSHBACK_FORCE,
            attackerPosition: { ...source.position },
          },
        });

        // Add visual projectile
        addVisualEffect(
          gameState,
          VisualEffectType.StoneProjectile,
          source.position,
          projectileDuration,
          undefined,
          target.position,
          target.id,
        );

        // Play launch sound
        playSoundAt(context, SoundType.Attack, source.position);
      } else {
        // Melee Attack Hits Immediately
        target.hitpoints -= damage;

        // Apply movement slowdown
        target.movementSlowdown = {
          modifier: HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
          endTime: gameState.time + HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
        };

        addVisualEffect(gameState, VisualEffectType.Hit, target.position, EFFECT_DURATION_SHORT_HOURS, target.id);

        // Apply push-back force
        const pushDirection = getDirectionVectorOnTorus(
          source.position,
          target.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        const pushForce = vectorScale(pushDirection, HUMAN_ATTACK_PUSHBACK_FORCE);
        target.forces.push(pushForce);

        if (target.hitpoints <= 0) {
          playSoundAt(context, SoundType.HumanDeath, target.position);
        } else {
          playSoundAt(context, SoundType.Attack, source.position);
        }

        // Add melee attack effect on source
        addVisualEffect(gameState, VisualEffectType.Attack, source.position, EFFECT_DURATION_SHORT_HOURS, source.id);
      }
    }

    // Cooldown and state reset
    source.attackCooldown = {
      melee: HUMAN_ATTACK_MELEE_COOLDOWN_HOURS,
      ranged: HUMAN_ATTACK_RANGED_COOLDOWN_HOURS,
    };

    const attackData = source.stateMachine![1] as HumanAttackingStateData;
    attackData.attackStartTime = gameState.time;
  },
};
