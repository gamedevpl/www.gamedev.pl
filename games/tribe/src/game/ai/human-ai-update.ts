import { HumanEntity } from "../entities/characters/human/human-types";
import { UpdateContext } from "../world-types";
import { humanAIStrategies } from "./strategies";

/**
 * Updates the AI decision-making for a human entity using a strategy pattern.
 * It iterates through a prioritized list of strategies and executes the first one
 * whose conditions are met.
 */
export function humanAIUpdate(human: HumanEntity, context: UpdateContext): void {
  for (const strategy of humanAIStrategies) {
    if (strategy.check(human, context)) {
      strategy.execute(human, context);
      return; // Strategy executed, decision made for this tick
    }
  }

  // If no strategy was applicable (should ideally be handled by a fallback strategy like IdleWanderStrategy)
  // As a safeguard, ensure the human is at least in a known state if nothing else applied.
  // However, IdleWanderStrategy.check() should always return true if it's the last one.
  if (!human.activeAction) {
    human.activeAction = "idle";
    human.direction = { x: 0, y: 0 };
    human.targetPosition = undefined;
  }
}
