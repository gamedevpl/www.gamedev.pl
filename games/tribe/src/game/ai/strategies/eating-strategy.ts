import { HumanEntity } from '../../entities/characters/human/human-types';
import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING, HUMAN_BERRY_HUNGER_REDUCTION } from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';

export class EatingStrategy implements HumanAIStrategy {
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
      if (human.berries <= 0 || human.hunger <= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING - HUMAN_BERRY_HUNGER_REDUCTION) {
        return true; // Conditions met to stop eating (will execute to change action to idle)
      }
      return true; // Still actively eating and should continue (will execute to essentially no-op or confirm eating state)
    }

    // Condition to START eating (only for adults)
    if (human.isAdult && human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING && human.berries > 0) {
      return true;
    }
    return false;
  }

  execute(human: HumanEntity): void {
    // Logic for STOPPING eating
    if (human.activeAction === 'eating') {
      if (human.berries <= 0 || human.hunger <= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING - HUMAN_BERRY_HUNGER_REDUCTION) {
        human.activeAction = 'idle';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
        return;
      }
      // If still eating, no change in action is needed here, the state machine handles hunger reduction.
      return;
    }


    // Logic for STARTING eating (now implicitly for adults due to the check method)
    if (human.isAdult && human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING && human.berries > 0) {
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return;
    }
  }
}
