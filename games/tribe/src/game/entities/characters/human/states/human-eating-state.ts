import { State } from '../../../../state-machine/state-machine-types';
import {
  HUMAN_FOOD_HUNGER_REDUCTION
} from '../../../../human-consts.ts';
import {
  EFFECT_DURATION_SHORT_HOURS
} from '../../../../effect-consts.ts';
import { HumanEntity } from '../human-types';
import { HumanStateData, HUMAN_EATING, HUMAN_IDLE } from './human-state-types';
import { addVisualEffect } from '../../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../../visual-effects/visual-effect-types';
import { playSoundAt } from '../../../../sound/sound-manager';
import { SoundType } from '../../../../sound/sound-types';

// Define the human eating state
export const humanEatingState: State<HumanEntity, HumanStateData> = {
  id: HUMAN_EATING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    if (entity.activeAction !== 'eating') {
      // If not actively eating, return to idle state
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_EATING,
        },
      };
    }

    // Eat food (reduce hunger, decrement food count)
    if (
      entity.food.length > 0 &&
      (!entity.eatingCooldownTime || updateContext.gameState.time >= entity.eatingCooldownTime) &&
      entity.hunger > HUMAN_FOOD_HUNGER_REDUCTION // Ensure eating is beneficial
    ) {
      entity.hunger = Math.max(0, entity.hunger - HUMAN_FOOD_HUNGER_REDUCTION);
      entity.food.pop();
      entity.eatingCooldownTime = updateContext.gameState.time + 1; // 1 second cooldown after eating
      playSoundAt(updateContext, SoundType.Eat, entity.position);

      // Trigger eating visual effect
      if (!entity.lastEatingEffectTime || updateContext.gameState.time - entity.lastEatingEffectTime > 2) {
        addVisualEffect(
          updateContext.gameState,
          VisualEffectType.Eating,
          entity.position,
          EFFECT_DURATION_SHORT_HOURS,
          entity.id,
        );
        entity.lastEatingEffectTime = updateContext.gameState.time;
      }
    }

    // After eating, or if unable to eat, human might do something else (e.g. become idle if no more food or not hungry enough)
    // For now, we assume it stays in eating if action is 'eating', or transitions to IDLE if action changes.
    // If hunger is very low or no food, the game logic/player should change activeAction.
    if (entity.hunger <= 0 || entity.food.length <= 0) {
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_EATING,
        },
      };
    }

    return {
      nextState: HUMAN_EATING, // Remain in eating state if conditions still met / action active
      data: data,
    };
  },
  onEnter: (context, nextData) => {
    // Reset acceleration and velocity when entering eating state
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
