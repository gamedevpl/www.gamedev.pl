import { InteractionDefinition } from "./interactions-types";
import { HumanEntity } from "../entities/characters/human/human-types";
import { UpdateContext } from "../world-types";
import {
  PARENT_FEEDING_RANGE,
  HUMAN_BERRY_HUNGER_REDUCTION,
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  PARENT_FEED_CHILD_COOLDOWN_HOURS,
} from "../world-consts";

export const humanChildFeedingInteraction: InteractionDefinition<
  HumanEntity,
  HumanEntity
> = {
  id: "humanChildFeeding",
  sourceType: "human", // Parent
  targetType: "human", // Child
  maxDistance: PARENT_FEEDING_RANGE,
  checker: (parent: HumanEntity, child: HumanEntity, context: UpdateContext): boolean => {
    return (
      parent.isAdult === true &&
      parent.berries > 0 &&
      (!parent.feedChildCooldownTime || parent.feedChildCooldownTime <= context.gameState.time) &&
      child.isAdult === false &&
      (child.motherId === parent.id || child.fatherId === parent.id) &&
      child.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD
    );
  },
  perform: (parent: HumanEntity, child: HumanEntity, context: UpdateContext): void => {
    parent.berries--;
    child.hunger = Math.max(0, child.hunger - HUMAN_BERRY_HUNGER_REDUCTION);
    // Apply cooldown using game hours. The time in gameState is in game hours.
    parent.feedChildCooldownTime = context.gameState.time + PARENT_FEED_CHILD_COOLDOWN_HOURS;
  },
};
