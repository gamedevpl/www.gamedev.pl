import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING } from '../../../world-consts';

export const eatAction: Action = {
  type: ActionType.EAT,

  getUtility(human: HumanEntity, _context: UpdateContext, goal: Goal): number {
    if (goal.type !== GoalType.SATISFY_HUNGER) {
      return 0;
    }

    const hasFood = human.food.length > 0;
    const isHungryEnough = human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING;

    if (hasFood && isHungryEnough) {
      // This is a direct and perfect way to satisfy hunger if conditions are met.
      return 1;
    }

    return 0;
  },

  execute(human: HumanEntity): void {
    human.activeAction = 'eating';
    human.direction = { x: 0, y: 0 };
    human.targetPosition = undefined;
  },
};
