import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import {
  HUMAN_ATTACK_RANGE,
  HUMAN_ATTACK_DAMAGE,
  HUMAN_ATTACK_COOLDOWN_HOURS,
  EFFECT_DURATION_SHORT_HOURS,
} from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { getDirectionVectorOnTorus, vectorScale } from '../utils/math-utils';
import { HUMAN_ATTACKING } from '../entities/characters/human/states/human-state-types';

/**
 * Interaction for humans attacking predators in self-defense.
 * Humans can attack predators that threaten them or their family.
 */
export const humanAttackPredatorInteraction: InteractionDefinition<HumanEntity, PredatorEntity> = {
  id: 'human-attack-predator',
  sourceType: 'human',
  targetType: 'predator',
  maxDistance: HUMAN_ATTACK_RANGE,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars  
  checker: (human, predator, _context) => {
    return !!(
      human.stateMachine?.[0] === HUMAN_ATTACKING &&
      human.attackTargetId === predator.id &&
      (!human.attackCooldown || human.attackCooldown <= 0) &&
      predator.hitpoints > 0 && // Target must be alive
      human.isAdult // Only adults can fight predators
    );
  },

  perform: (human, predator, context) => {
    // Calculate damage (humans are less effective against predators than prey)
    let damage = HUMAN_ATTACK_DAMAGE * 0.8; // 20% less effective against predators
    
    // Male damage modifier (men are better fighters)
    if (human.gender === 'male') {
      damage *= 1.2;
    }

    // Group fighting bonus - if other humans are nearby fighting, increase damage
    const nearbyFightingHumans = Array.from(context.gameState.entities.entities.values())
      .filter((e) => e.type === 'human' && e.id !== human.id)
      .filter((h) => {
        const otherHuman = h as HumanEntity;
        const distance = Math.sqrt(
          Math.pow(otherHuman.position.x - human.position.x, 2) + 
          Math.pow(otherHuman.position.y - human.position.y, 2)
        );
        return distance < 100 && otherHuman.activeAction === 'attacking' && otherHuman.attackTargetId === predator.id;
      }).length;

    if (nearbyFightingHumans > 0) {
      damage *= (1 + nearbyFightingHumans * 0.2); // 20% bonus per nearby ally
    }

    // Deal damage to predator
    predator.hitpoints -= damage;

    // Apply pushback force to predator
    const pushDirection = getDirectionVectorOnTorus(
      human.position,
      predator.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, 8); // Stronger pushback than prey
    predator.forces.push(pushForce);

    // Set attack cooldown
    human.attackCooldown = HUMAN_ATTACK_COOLDOWN_HOURS;

    // If predator is killed, no special rewards (unlike hunting prey)
    if (predator.hitpoints <= 0) {
      // Play death sound
      playSoundAt(context, SoundType.HumanDeath, predator.position); // Reuse human death sound
      
      // Add hit effect on predator
      addVisualEffect(context.gameState, VisualEffectType.Hit, predator.position, EFFECT_DURATION_SHORT_HOURS, predator.id);
    } else {
      // Predator survives, just add hit effect and make it potentially flee or become more aggressive
      addVisualEffect(context.gameState, VisualEffectType.Hit, predator.position, EFFECT_DURATION_SHORT_HOURS, predator.id);
      
      // Wounded predators might become more desperate and aggressive
      if (predator.hitpoints < predator.maxHitpoints * 0.3) {
        predator.hunger += 20; // Desperation increases hunger drive
      }
      
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
  },
};