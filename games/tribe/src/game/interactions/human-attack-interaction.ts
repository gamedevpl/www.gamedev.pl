import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  HUMAN_ATTACK_RANGE,
  HUMAN_ATTACK_COOLDOWN_HOURS,
  HUMAN_ATTACK_STUN_CHANCE,
  HUMAN_STUN_DURATION_HOURS,
  HUMAN_ATTACK_KILL_CHANCE,
  HUMAN_ATTACK_BUILDUP_HOURS,
  HUMAN_ATTACK_PUSHBACK_FORCE,
  EFFECT_DURATION_SHORT_HOURS,
} from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { HUMAN_ATTACKING, HumanAttackingStateData } from '../entities/characters/human/states/human-state-types';
import { getDirectionVectorOnTorus, vectorScale } from '../utils/math-utils';

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
    // If the target is already stunned, the attack could be fatal
    if (target.isStunned) {
      if (Math.random() < HUMAN_ATTACK_KILL_CHANCE) {
        target.isKilled = true;
        playSoundAt(context, SoundType.HumanDeath, target.position);
      } else {
        // Attack Resisted (not killed)
        addVisualEffect(
          context.gameState,
          VisualEffectType.AttackResisted,
          target.position, // Effect on the target
          EFFECT_DURATION_SHORT_HOURS,
          target.id,
        );
        playSoundAt(context, SoundType.Attack, source.position); // Play attack sound as it wasn't fatal
      }
    } else {
      // If the target is not stunned, there's a chance to stun them
      if (Math.random() < HUMAN_ATTACK_STUN_CHANCE) {
        target.isStunned = true;
        target.stunnedUntil = context.gameState.time + HUMAN_STUN_DURATION_HOURS;
        target.activeAction = 'stunned';
        // Stun successful - create a continuous effect
        const effectId = addVisualEffect(
          context.gameState,
          VisualEffectType.Stunned,
          target.position, // Effect on the target
          Infinity, // Continuous effect, will be removed manually
          target.id,
        );
        target.stunVisualEffectId = effectId;
      } else {
        // Attack Deflected (not stunned)
        addVisualEffect(
          context.gameState,
          VisualEffectType.AttackDeflected,
          target.position, // Effect on the target
          EFFECT_DURATION_SHORT_HOURS,
          target.id,
        );
      }
      // Play attack sound for any non-fatal attack on a non-stunned person
      playSoundAt(context, SoundType.Attack, source.position);
    }

    // Apply push-back force
    const pushDirection = getDirectionVectorOnTorus(
      source.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, HUMAN_ATTACK_PUSHBACK_FORCE);
    target.forces.push(pushForce);

    // Set the attacker's cooldown
    source.attackCooldown = HUMAN_ATTACK_COOLDOWN_HOURS;
    // Reset the attacker's action to idle after the attack
    source.activeAction = 'idle';
    source.attackTargetId = undefined;

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
