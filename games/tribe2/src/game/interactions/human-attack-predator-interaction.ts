import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import {
  HUMAN_ATTACK_MELEE_RANGE,
  HUMAN_ATTACK_MELEE_DAMAGE,
  HUMAN_ATTACK_MELEE_COOLDOWN_HOURS,
  HUMAN_ATTACK_RANGED_COOLDOWN_HOURS,
  HUMAN_ATTACK_RANGED_RANGE,
  HUMAN_ATTACK_RANGED_DAMAGE,
  HUMAN_ATTACK_RANGED_BUILDUP_HOURS,
  HUMAN_ATTACK_MELEE_BUILDUP_HOURS,
  HUMAN_ATTACK_RANGED_PUSHBACK_FORCE,
  HUMAN_ATTACK_STONE_SPEED,
} from '../human-consts.ts';
import { EFFECT_DURATION_SHORT_HOURS } from '../effect-consts.ts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorScale } from '../utils/math-utils';
import { HUMAN_ATTACKING, HumanAttackingStateData } from '../entities/characters/human/states/human-state-types';

/**
 * Interaction for humans attacking predators in self-defense.
 * Humans can attack predators that threaten them or their family.
 */
export const humanAttackPredatorInteraction: InteractionDefinition<HumanEntity, PredatorEntity> = {
  id: 'human-attack-predator',
  sourceType: 'human',
  targetType: 'predator',
  maxDistance: HUMAN_ATTACK_RANGED_RANGE,

  checker: (human, predator, context) => {
    if (
      human.stateMachine[0] !== HUMAN_ATTACKING ||
      human.attackTargetId !== predator.id ||
      predator.hitpoints <= 0 ||
      !human.isAdult
    ) {
      return false;
    }

    const distance = calculateWrappedDistance(
      human.position,
      predator.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    const isMelee = distance <= HUMAN_ATTACK_MELEE_RANGE;
    const isRanged = !isMelee && distance <= HUMAN_ATTACK_RANGED_RANGE;

    if (!isMelee && !isRanged) {
      return false;
    }

    const cooldown = isMelee ? human.attackCooldown?.melee || 0 : human.attackCooldown?.ranged || 0;
    if (cooldown > 0) {
      return false;
    }

    const buildup = isMelee ? HUMAN_ATTACK_MELEE_BUILDUP_HOURS : HUMAN_ATTACK_RANGED_BUILDUP_HOURS;
    const attackData = human.stateMachine[1] as HumanAttackingStateData;
    const timeSinceAttackStart = context.gameState.time - attackData.attackStartTime;

    return timeSinceAttackStart >= buildup;
  },

  perform: (human, predator, context) => {
    const { gameState } = context;

    const distance = calculateWrappedDistance(
      human.position,
      predator.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    const isRanged = distance > HUMAN_ATTACK_MELEE_RANGE;

    // Calculate damage (humans are less effective against predators than prey)
    let damage = (isRanged ? HUMAN_ATTACK_RANGED_DAMAGE : HUMAN_ATTACK_MELEE_DAMAGE) * 0.8; // 20% less effective against predators

    // Male damage modifier (men are better fighters)
    if (human.gender === 'male') {
      damage *= 1.2;
    }

    // Group fighting bonus - if other humans are nearby fighting, increase damage
    const nearbyFightingHumans = Object.values(gameState.entities.entities)
      .filter((e) => e.type === 'human' && e.id !== human.id)
      .filter((h) => {
        const otherHuman = h as HumanEntity;
        const dist = Math.sqrt(
          Math.pow(otherHuman.position.x - human.position.x, 2) + Math.pow(otherHuman.position.y - human.position.y, 2),
        );
        return dist < 100 && otherHuman.activeAction === 'attacking' && otherHuman.attackTargetId === predator.id;
      }).length;

    if (nearbyFightingHumans > 0) {
      damage *= 1 + nearbyFightingHumans * 0.2; // 20% bonus per nearby ally
    }

    if (isRanged) {
      const projectileDuration = distance / HUMAN_ATTACK_STONE_SPEED;

      // Schedule Ranged Impact
      gameState.scheduledEvents.push({
        id: gameState.nextScheduledEventId++,
        type: 'ranged-impact',
        scheduledTime: gameState.time + projectileDuration,
        data: {
          attackerId: human.id,
          targetId: predator.id,
          damage,
          pushbackForce: HUMAN_ATTACK_RANGED_PUSHBACK_FORCE,
          attackerPosition: { ...human.position },
        },
      });

      // Add visual projectile
      addVisualEffect(
        gameState,
        VisualEffectType.StoneProjectile,
        human.position,
        projectileDuration,
        undefined,
        predator.position,
        predator.id,
      );

      // Play launch sound
      playSoundAt(context, SoundType.Attack, human.position);
    } else {
      // Melee Attack Hits Immediately
      predator.hitpoints -= damage;

      // Apply pushback force to predator
      const pushDirection = getDirectionVectorOnTorus(
        human.position,
        predator.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );
      const pushForce = vectorScale(pushDirection, 8); // 8 is the original melee pushback
      predator.forces.push(pushForce);

      if (predator.hitpoints <= 0) {
        playSoundAt(context, SoundType.HumanDeath, predator.position);
        addVisualEffect(gameState, VisualEffectType.Hit, predator.position, EFFECT_DURATION_SHORT_HOURS, predator.id);
      } else {
        addVisualEffect(gameState, VisualEffectType.Hit, predator.position, EFFECT_DURATION_SHORT_HOURS, predator.id);

        // Wounded predators might become more desperate and aggressive
        if (predator.hitpoints < predator.maxHitpoints * 0.3) {
          predator.hunger += 20;
        }

        playSoundAt(context, SoundType.Attack, human.position);
      }

      // Add melee attack effect on human
      addVisualEffect(gameState, VisualEffectType.Attack, human.position, EFFECT_DURATION_SHORT_HOURS, human.id);
    }

    // Set attack cooldown
    human.attackCooldown = { melee: HUMAN_ATTACK_MELEE_COOLDOWN_HOURS, ranged: HUMAN_ATTACK_RANGED_COOLDOWN_HOURS };

    // Reset attack start time
    const attackData = human.stateMachine![1] as HumanAttackingStateData;
    attackData.attackStartTime = gameState.time;
  },
};
