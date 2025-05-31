import { State } from "../../../../state-machine/state-machine-types";
import { HUMAN_BERRY_HUNGER_REDUCTION } from "../../../../world-consts";
import { HumanEntity } from "../human-types";
import { HumanStateData, HUMAN_EATING, HUMAN_IDLE } from "./human-state-types";

// Define the human eating state
export const humanEatingState: State<HumanEntity, HumanStateData> = {
  id: HUMAN_EATING,
  update: (data, context) => {
    const { entity, updateContext } = context;

    if (entity.activeAction !== "eating") {
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

    // Eat a berry (reduce hunger, decrement berry count)
    if (
      entity.berries > 0 &&
      (!entity.eatingCooldownTime || updateContext.gameState.time >= entity.eatingCooldownTime) &&
      entity.hunger > HUMAN_BERRY_HUNGER_REDUCTION // Ensure eating is beneficial
    ) {
      entity.hunger = Math.max(0, entity.hunger - HUMAN_BERRY_HUNGER_REDUCTION);
      entity.berries = Math.max(0, entity.berries - 1);
      entity.eatingCooldownTime = updateContext.gameState.time + 1; // 1 second cooldown after eating
    }

    // After eating, or if unable to eat, human might do something else (e.g. become idle if no more berries or not hungry enough)
    // For now, we assume it stays in eating if action is 'eating', or transitions to IDLE if action changes.
    // If hunger is very low or no berries, the game logic/player should change activeAction.
    if (entity.hunger <= 0 || entity.berries <= 0) {
        return {
            nextState: HUMAN_IDLE,
            data: {
                ...data,
                enteredAt: updateContext.gameState.time,
                previousState: HUMAN_EATING,
            }
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
