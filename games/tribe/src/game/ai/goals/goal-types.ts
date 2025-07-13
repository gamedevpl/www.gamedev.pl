import { HumanEntity } from "../../entities/characters/human/human-types";
import { UpdateContext } from "../../world-types";

export enum GoalType {
  SATISFY_HUNGER = "SATISFY_HUNGER",
  MAINTAIN_HEALTH = "MAINTAIN_HEALTH",
  GATHER_FOOD = "GATHER_FOOD",
  PLANT_BUSHES = "PLANT_BUSHES",
  PROCREATE = "PROCREATE",
  FEED_CHILDREN = "FEED_CHILDREN",
  DEFEND_SELF = "DEFEND_SELF",
  DEFEND_TRIBE = "DEFEND_TRIBE",
  ELIMINATE_THREATS = "ELIMINATE_THREATS",
  EXPLORE_AND_WANDER = "EXPLORE_AND_WANDER",
}

export interface Goal {
  type: GoalType;

  /**
   * Calculates the current urgency or importance of this goal for a given human.
   * @param human The human entity to evaluate for.
   * @param context The current game update context.
   * @returns A numerical score representing the goal's urgency. Higher means more urgent.
   */
  getScore(human: HumanEntity, context: UpdateContext): number;
}
