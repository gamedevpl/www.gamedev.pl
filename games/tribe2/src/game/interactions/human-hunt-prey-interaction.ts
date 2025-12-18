import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
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
 * Interaction for humans hunting prey.
 * Humans can attack prey for food when they are in attacking state.
 */
export const humanHuntPreyInteraction: InteractionDefinition<HumanEntity, PreyEntity> = {
  id: 'human-hunt-prey',
  sourceType: 'human',
  targetType: 'prey',
  maxDistance: HUMAN_ATTACK_RANGED_RANGE,

  checker: (human, prey, context) => {
    if (
      human.stateMachine?.[0] !== HUMAN_ATTACKING ||
      human.attackTargetId !== prey.id ||
      prey.hitpoints <= 0 ||
      !human.isAdult
    ) {
      return false;
    }

    const distance = calculateWrappedDistance(
      human.position,
      prey.position,
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

  perform: (human, prey, context) => {
    const { gameState } = context;

    const distance = calculateWrappedDistance(
      human.position,
      prey.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    const isRanged = distance > HUMAN_ATTACK_MELEE_RANGE;

    // Calculate damage (similar to human-human combat but more effective against prey)
    let damage = (isRanged ? HUMAN_ATTACK_RANGED_DAMAGE : HUMAN_ATTACK_MELEE_DAMAGE) * 1.2; // 20% more effective against prey

    // Male damage modifier
    if (human.gender === 'male') {
      damage *= 1.3; // Males are more effective hunters
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
          targetId: prey.id,
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
        prey.position,
        prey.id,
      );

      // Play launch sound
      playSoundAt(context, SoundType.Attack, human.position);
    } else {
      // Melee Attack Hits Immediately
      prey.hitpoints -= damage;

      // Apply pushback force to prey
      const pushDirection = getDirectionVectorOnTorus(
        human.position,
        prey.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );
      const pushForce = vectorScale(pushDirection, 6); // 6 is the original melee pushback
      prey.forces.push(pushForce);

      if (prey.hitpoints <= 0) {
        playSoundAt(context, SoundType.HumanDeath, prey.position);
        addVisualEffect(gameState, VisualEffectType.Hit, prey.position, EFFECT_DURATION_SHORT_HOURS, prey.id);
      } else {
        addVisualEffect(gameState, VisualEffectType.Hit, prey.position, EFFECT_DURATION_SHORT_HOURS, prey.id);
        prey.fleeCooldown = 8;
        playSoundAt(context, SoundType.Attack, human.position);
      }

      // Add melee attack effect on human
      addVisualEffect(gameState, VisualEffectType.Attack, human.position, EFFECT_DURATION_SHORT_HOURS, human.id);
    }

    // Set attack cooldown and reset attack start time
    human.attackCooldown = { melee: HUMAN_ATTACK_MELEE_COOLDOWN_HOURS, ranged: HUMAN_ATTACK_RANGED_COOLDOWN_HOURS };
    const attackData = human.stateMachine![1] as HumanAttackingStateData;
    attackData.attackStartTime = gameState.time;
  },
};
