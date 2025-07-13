import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal } from '../goals/goal-types';

export enum ActionType {
  EAT = 'EAT',
  GATHER_FOOD = 'GATHER_FOOD',
  PLANT_BUSH = 'PLANT_BUSH',
  FLEE = 'FLEE',
  ATTACK_HUMAN = 'ATTACK_HUMAN',
  PROCREATE = 'PROCREATE',
  FEED_CHILD = 'FEED_CHILD',
  SEEK_FOOD_FROM_PARENT = 'SEEK_FOOD_FROM_PARENT',
  GATHER_FOOD_FOR_CHILD = 'GATHER_FOOD_FOR_CHILD',
  CALL_TO_ATTACK = 'CALL_TO_ATTACK',
  MIGRATE = 'MIGRATE',
  IDLE_WANDER = 'IDLE_WANDER',
}

export interface Action {
  type: ActionType;

  /**
   * Calculates how well this action satisfies a given goal for a specific human.
   * @param human The human entity to evaluate for.
   * @param context The current game update context.
   * @param goal The goal to evaluate against.
   * @returns A numerical utility score. Higher is better.
   */
  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number;

  /**
   * Executes the action logic for the given human.
   * @param human The human entity performing the action.
   * @param context The current game update context.
   */
  execute(human: HumanEntity, context: UpdateContext): void;
}
