import { Entity, GameWorldState } from '../world-types';
import { BTContext } from '../ai/behavior-tree-types';

/**
 * Updates the behavior tree for a given entity.
 * @param entity The entity to update.
 * @param state The current game world state.
 * @param deltaTime The time elapsed since the last frame in seconds.
 */
export function updateBehaviorTree(entity: Entity, state: GameWorldState, deltaTime: number): void {
  if (!entity.behaviorTree) {
    return;
  }

  const { tree } = entity.behaviorTree;

  // Create a context that includes the entity, world state, and delta time
  // We merge this with the existing tree context to preserve state between frames (like targetPosition)
  const context: BTContext = {
    ...tree.context,
    entity,
    state,
    deltaTime,
  };

  // Execute the behavior tree
  const status = tree.root.execute(context);

  // Update the context back to the tree to save state
  // We filter out the transient properties (entity, state, deltaTime) to avoid circular references or memory leaks if we were serializing
  // But for now, just copying back the properties we care about (like targetPosition) is handled by the nodes modifying the passed context object directly.
  // Since `context` spreads `tree.context`, and nodes modify `context`, we need to ensure those changes propagate back if they are new properties.
  // However, in JS, if we modify properties of `context` that were references from `tree.context`, they update.
  // But if we add new properties to `context`, they won't be in `tree.context`.
  // So let's explicitly copy relevant custom state back.
  // For simplicity in this implementation, we can just assign the context back, but be mindful of the transient props.
  // A better approach for this simple engine:
  Object.assign(tree.context, context);
  // Remove transient props from the persistent context to keep it clean
  delete tree.context.entity;
  delete tree.context.state;
  delete tree.context.deltaTime;

  entity.behaviorTree.lastStatus = status;
}
