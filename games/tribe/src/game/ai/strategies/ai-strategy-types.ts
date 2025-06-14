import { HumanEntity } from "../../entities/characters/human/human-types";
import { UpdateContext } from "../../world-types";

/**
 * Defines the interface for a human AI strategy.
 * Each strategy encapsulates a specific behavior or decision-making logic.
 * It's designed to be stateless. The `check` method should perform any necessary
 * checks and return a context (like a target entity) if the conditions are met.
 * This context is then passed to the `execute` method.
 *
 * @template T The type of the context object returned by `check` and passed to `execute`.
 * Can be a boolean, an entity, or any other data structure.
 */
export interface HumanAIStrategy<T> {
  /**
   * Checks if this strategy should be applied to the human entity and returns
   * the necessary context for execution if it should.
   * @param human The human entity to evaluate.
   * @param context The current game update context.
   * @returns The context for the `execute` method if the strategy can be applied,
   * otherwise `null` or `false`.
   */
  check(human: HumanEntity, context: UpdateContext): T | null | false;

  /**
   * Executes the strategy's logic on the human entity.
   * This method is called only if `check` returns a truthy value.
   * @param human The human entity to apply the strategy to.
   * @param context The current game update context.
   * @param checkResult The result returned by the `check` method.
   */
  execute(human: HumanEntity, context: UpdateContext, checkResult: T): void;
}
