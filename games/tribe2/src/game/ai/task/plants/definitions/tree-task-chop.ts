import { TreeEntity } from '../../../../entities/plants/tree/tree-types';
import { UpdateContext } from '../../../../world-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskDefinition, TaskType } from '../../task-types';
import { TREE_GROWING, TREE_FULL, TREE_SPREADING } from '../../../../entities/plants/tree/states/tree-state-types';

export const treeChopProducer: TaskDefinition<TreeEntity> = {
  type: TaskType.HumanChopTree,
  producer: (tree: TreeEntity, context: UpdateContext) => {
    const tasks: Record<string, Task> = {};

    if (tree.type !== 'tree') return tasks;

    const [state] = tree.stateMachine ?? [];
    const isStanding = state === TREE_GROWING || state === TREE_FULL || state === TREE_SPREADING;

    if (isStanding) {
      const taskId = `chop-tree-${tree.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanChopTree,
        creatorEntityId: tree.id,
        target: tree.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
};
