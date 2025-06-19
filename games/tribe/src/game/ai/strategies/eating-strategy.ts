import { HumanEntity } from '../../entities/characters/human/human-types';
import {
  HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING,
  HUMAN_FOOD_HUNGER_REDUCTION,
} from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';

export class EatingStrategy implements HumanAIStrategy<boolean> {
  check(human: HumanEntity): boolean {
    // Prevent non-adult children from using this strategy to eat from their own inventory
    if (!human.isAdult) {
      return false;
    }

    // If human is a child and not currently eating, this strategy is not for them (they get fed by parents)
    if (!human.isAdult && human.activeAction !== 'eating') {
      return false;
    }

    // Condition to STOP eating (applies to adults and children if they are already eating)
    if (human.activeAction === 'eating') {
      const hungerThreshold = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING;
      const stopEatingThreshold = hungerThreshold - HUMAN_FOOD_HUNGER_REDUCTION;

      if (human.food.length <= 0 || human.hunger <= stopEatingThreshold) {
        return true; // Conditions met to stop eating
      }
      return true; // Still actively eating
    }

    // Condition to START eating (only for adults)
    if (human.isAdult && human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING && human.food.length > 0) {
      return true;
    }
    return false;
  }

  execute(human: HumanEntity): void {
    // Logic for STOPPING eating
    if (human.activeAction === 'eating') {
      const hungerThreshold = HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING;
      const stopEatingThreshold = hungerThreshold - HUMAN_FOOD_HUNGER_REDUCTION;
      
      if (human.food.length <= 0 || human.hunger <= stopEatingThreshold) {
        human.activeAction = 'idle';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
        return;
      }
      // If still eating, no change in action is needed. The state machine handles hunger/resource reduction.
      return;
    }

    // Logic for STARTING eating
    if (human.isAdult && human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING && human.food.length > 0) {
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      human.activeAction = 'eating';
    }
  }
}
