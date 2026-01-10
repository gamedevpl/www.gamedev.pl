import { TreeEntity } from '../../../../entities/plants/tree/tree-types';
import { UpdateContext } from '../../../../world-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskDefinition, TaskType } from '../../task-types';
import { TREE_GROWING, TREE_FULL, TREE_SPREADING } from '../../../../entities/plants/tree/states/tree-state-types';
import { IndexedWorldState } from '../../../../world-index/world-index-types';

export const treeChopProducer: TaskDefinition<TreeEntity> = {
  type: TaskType.HumanChopTree,
  producer: (tree: TreeEntity, context: UpdateContext) => {
    const tasks: Record<string, Task> = {};

    if (tree.type !== 'tree') return tasks;

    const [state] = tree.stateMachine ?? [];
    const isStanding = state === TREE_GROWING || state === TREE_FULL || state === TREE_SPREADING;

    if (isStanding) {
      // Check if any human is trapped by this tree
      const indexedState = context.gameState as IndexedWorldState;
      const nearbyHumans = indexedState.search.human.byRadius(tree.position, 100);
      const trappedHuman = nearbyHumans.find(h => h.trappedByObstacleId === tree.id);

      // Produce task if tree is mature OR if it's trapping someone
      if (state === TREE_FULL || state === TREE_SPREADING || trappedHuman) {
        const taskId = `chop-tree-${tree.id}`;
        tasks[taskId] = {
          id: taskId,
          type: TaskType.HumanChopTree,
          position: tree.position,
          creatorEntityId: tree.id,
          target: tree.id,
          validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
        };
      }
    }

    return tasks;
  },
};
