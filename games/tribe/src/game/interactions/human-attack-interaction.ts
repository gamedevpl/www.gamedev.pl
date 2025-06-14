import { InteractionDefinition } from "./interactions-types";
import { HumanEntity } from "../entities/characters/human/human-types";
import {
  HUMAN_ATTACK_RANGE,
  HUMAN_ATTACK_COOLDOWN_HOURS,
  HUMAN_ATTACK_STUN_CHANCE,
  HUMAN_STUN_DURATION_HOURS,
} from "../world-consts";
import { createHumanCorpse, removeEntity } from "../entities/entities-update";
import { addVisualEffect } from "../utils/visual-effects-utils";
import { VisualEffectType } from "../visual-effects/visual-effect-types";
import { EFFECT_DURATION_SHORT_HOURS } from "../world-consts";
import { playSound } from "../sound/sound-utils";
import { SoundType } from "../sound/sound-types";

export const humanAttackInteraction: InteractionDefinition<
  HumanEntity,
  HumanEntity
> = {
  id: "human-attack",
  sourceType: "human",
  targetType: "human",
  maxDistance: HUMAN_ATTACK_RANGE,

  checker: (source, target) => {
    // Check if the source is in the 'attacking' action, targeting the specific target, and not on cooldown
    return (
      source.activeAction === "attacking" &&
      source.attackTargetId === target.id &&
      (source.attackCooldown || 0) <= 0
    );
  },

  perform: (source, target, context) => {
    // If the target is already stunned, the attack is fatal
    if (target.isStunned) {
      // Create a corpse for the target
      createHumanCorpse(
        context.gameState.entities,
        target.position,
        target.gender,
        target.age,
        target.id,
        context.gameState.time,
      );
      // Remove the target entity
      removeEntity(context.gameState.entities, target.id);
      playSound(SoundType.HumanDeath);
    } else {
      // If the target is not stunned, there's a chance to stun them
      if (Math.random() < HUMAN_ATTACK_STUN_CHANCE) {
        target.isStunned = true;
        target.stunnedUntil =
          context.gameState.time + HUMAN_STUN_DURATION_HOURS;
        target.activeAction = "stunned";
      }
      playSound(SoundType.Attack);
    }

    // Set the attacker's cooldown
    source.attackCooldown = HUMAN_ATTACK_COOLDOWN_HOURS;
    // Reset the attacker's action to idle after the attack
    source.activeAction = "idle";

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
