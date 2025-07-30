import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
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
import { FoodType } from '../food/food-types';
import { HUMAN_ATTACKING } from '../entities/characters/human/states/human-state-types';

/**
 * Interaction for humans hunting prey.
 * Humans can attack prey for food when they are in attacking state.
 */
export const humanHuntPreyInteraction: InteractionDefinition<HumanEntity, PreyEntity> = {
  id: 'human-hunt-prey',
  sourceType: 'human',
  targetType: 'prey',
  maxDistance: HUMAN_ATTACK_RANGE,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars  
  checker: (human, prey, _context) => {
    return !!(
      human.stateMachine?.[0] === HUMAN_ATTACKING &&
      human.attackTargetId === prey.id &&
      (!human.attackCooldown || human.attackCooldown <= 0) &&
      prey.hitpoints > 0 && // Target must be alive
      human.isAdult // Only adults can hunt
    );
  },

  perform: (human, prey, context) => {
    // Calculate damage (similar to human-human combat but more effective against prey)
    let damage = HUMAN_ATTACK_DAMAGE * 1.2; // 20% more effective against prey
    
    // Male damage modifier
    if (human.gender === 'male') {
      damage *= 1.3; // Males are more effective hunters
    }

    // Deal damage to prey
    prey.hitpoints -= damage;

    // Apply pushback force to prey
    const pushDirection = getDirectionVectorOnTorus(
      human.position,
      prey.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, 6);
    prey.forces.push(pushForce);

    // Set attack cooldown
    human.attackCooldown = HUMAN_ATTACK_COOLDOWN_HOURS;

    // If prey is killed, human gets meat
    if (prey.hitpoints <= 0) {
      // Add meat to human's inventory if there's space
      if (human.food.length < human.maxFood) {
        human.food.push({
          type: FoodType.Meat,
        });
      }
      
      // Play death sound
      playSoundAt(context, SoundType.HumanDeath, prey.position); // Reuse human death sound
      
      // Add hit effect on prey
      addVisualEffect(context.gameState, VisualEffectType.Hit, prey.position, EFFECT_DURATION_SHORT_HOURS, prey.id);
    } else {
      // Prey survives, just add hit effect and make it flee
      addVisualEffect(context.gameState, VisualEffectType.Hit, prey.position, EFFECT_DURATION_SHORT_HOURS, prey.id);
      
      // Set prey to flee from this human
      prey.fleeTargetId = human.id;
      prey.fleeCooldown = 8; // 8 hours of fleeing from humans (longer than predators)
      
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