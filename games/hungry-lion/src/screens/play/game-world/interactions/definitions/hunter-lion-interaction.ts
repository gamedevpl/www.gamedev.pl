import { InteractionDefinition } from '../interactions-types';
import { vectorDistance, vectorNormalize, vectorSubtract, vectorScale } from '../../utils/math-utils';
import { LionEntity, HunterEntity } from '../../entities/entities-types';
import { addDamageNotification } from '../../notifications/notifications-update';

// Constants for lion-hunter interaction
const HEALTH_DECREMENT = 2; // Damage done to hunter by lion attack
const FORCE_STRENGTH = 0.007; // Force applied to hunter when attacked
const INTERACTION_DISTANCE = 30; // Distance at which lion can attack hunter
const HUNGER_INCREASE = 1; // Amount of hunger recovered when attacking hunter

// Hunter-lion interaction definition
export const HUNTER_LION_INTERACTION: InteractionDefinition = {
  sourceType: 'lion',
  targetType: 'hunter',

  minDistance: 0,
  maxDistance: INTERACTION_DISTANCE,

  checker: (source, target) => {
    const distance = vectorDistance(source.position, target.position);
    return distance < INTERACTION_DISTANCE;
  },

  perform: (source, target, updateContext) => {
    const lion = source as LionEntity;
    const hunter = target as HunterEntity;

    // Lion attacks hunter
    hunter.health = Math.max(hunter.health - HEALTH_DECREMENT, 0);

    // Create damage notification
    addDamageNotification(
      updateContext.gameState,
      hunter.position,
      HEALTH_DECREMENT
    );

    // Lion gains a small amount of hunger back from attacking
    lion.hungerLevel = Math.min(lion.hungerLevel + HUNGER_INCREASE, 100);

    // Apply slow debuff to hunter
    hunter.debuffs.push({
      type: 'slow',
      startTime: updateContext.gameState.time,
      duration: 500,
    });

    // Apply force towards lion (hunter is pulled toward lion during attack)
    const direction = vectorNormalize(vectorSubtract(source.position, hunter.position));
    const force = vectorScale(direction, FORCE_STRENGTH);
    hunter.forces.push(force);

    // If hunter is in shooting state, this attack might interrupt it
    if (hunter.stateMachine[0] === 'HUNTER_SHOOTING') {
      // 50% chance to interrupt shooting and force hunter to move
      if (Math.random() < 0.5) {
        hunter.stateMachine = ['HUNTER_CHASING', {
          enteredAt: updateContext.gameState.time,
          previousState: 'HUNTER_SHOOTING'
        }];
      }
    }
  },
};