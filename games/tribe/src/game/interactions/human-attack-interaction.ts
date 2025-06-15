import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  HUMAN_ATTACK_RANGE,
  HUMAN_ATTACK_COOLDOWN_HOURS,
  HUMAN_ATTACK_STUN_CHANCE,
  HUMAN_STUN_DURATION_HOURS,
  HUMAN_ATTACK_KILL_CHANCE,
} from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { EFFECT_DURATION_SHORT_HOURS } from '../world-consts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { HUMAN_ATTACKING } from '../entities/characters/human/states/human-state-types';

export const humanAttackInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id: 'human-attack',
  sourceType: 'human',
  targetType: 'human',
  maxDistance: HUMAN_ATTACK_RANGE,

  checker: (source, target) => {
    // Check if the source is in the 'attacking' state, targeting the specific target, and not on cooldown
    return (
      source.stateMachine?.[0] === HUMAN_ATTACKING &&
      source.attackTargetId === target.id &&
      (source.attackCooldown || 0) <= 0
    );
  },

  perform: (source, target, context) => {
    // If the target is already stunned, the attack is fatal
    if (target.isStunned) {
      if (Math.random() < HUMAN_ATTACK_KILL_CHANCE) {
        target.isKilled = true;
        playSoundAt(context, SoundType.HumanDeath, target.position);
      }
    } else {
      // If the target is not stunned, there's a chance to stun them
      if (Math.random() < HUMAN_ATTACK_STUN_CHANCE) {
        target.isStunned = true;
        target.stunnedUntil = context.gameState.time + HUMAN_STUN_DURATION_HOURS;
        target.activeAction = 'stunned';
      }
      playSoundAt(context, SoundType.Attack, source.position);
    }

    // Set the attacker's cooldown
    source.attackCooldown = HUMAN_ATTACK_COOLDOWN_HOURS;
    // Reset the attacker's action to idle after the attack
    source.activeAction = 'idle';

    // Add visual effect for the attack
    addVisualEffect(
      context.gameState,
      VisualEffectType.Attack,
      source.position,
      EFFECT_DURATION_SHORT_HOURS,
      source.id,
    );
    source.attackTargetId = undefined;
  },
};
