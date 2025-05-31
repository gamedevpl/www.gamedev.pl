import { EatingStrategy } from "./eating-strategy";
import { GatheringStrategy } from "./gathering-strategy";
import { IdleWanderStrategy } from "./idle-wander-strategy";
import { HumanAIStrategy } from "./ai-strategy-types";

/**
 * A list of all available human AI strategies, ordered by priority.
 * The AI will iterate through this list and execute the first strategy
 * whose conditions are met.
 */
export const humanAIStrategies: HumanAIStrategy[] = [
  new EatingStrategy(),
  new GatheringStrategy(),
  new IdleWanderStrategy(), // Fallback, should always be last
];
