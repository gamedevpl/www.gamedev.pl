import { HumanEntity } from "../../entities/characters/human/human-types";
import { UpdateContext } from "../../world-types";

/**
 * Defines the interface for a human AI strategy.
 * Each strategy encapsulates a specific behavior or decision-making logic.
 */
export interface HumanAIStrategy {
  /**
   * Checks if this strategy should be applied to the human entity.
   * @param human The human entity to evaluate.
   * @param context The current game update context.
   * @returns True if the strategy conditions are met, false otherwise.
   */
  check(human: HumanEntity, context: UpdateContext): boolean;

  /**
   * Executes the strategy's logic on the human entity.
   * This method is called only if `check` returns true.
   * @param human The human entity to apply the strategy to.
   * @param context The current game update context.
   */
  execute(human: HumanEntity, context: UpdateContext): void;
}
