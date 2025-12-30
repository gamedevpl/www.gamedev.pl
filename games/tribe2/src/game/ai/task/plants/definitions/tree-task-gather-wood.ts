import { TreeEntity } from '../../../../entities/plants/tree/tree-types';
import { UpdateContext } from '../../../../world-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskDefinition, TaskType } from '../../task-types';
import { TREE_FALLEN } from '../../../../entities/plants/tree/states/tree-state-types';

export const treeGatherWoodProducer: TaskDefinition<TreeEntity> = {
  type: TaskType.HumanGatherWood,
  producer: (tree: TreeEntity, context: UpdateContext) => {
    const tasks: Record<string, Task> = {};

    if (tree.type !== 'tree') return tasks;

    const [state] = tree.stateMachine ?? [];
    const isFallen = state === TREE_FALLEN;

    if (isFallen && tree.wood.length > 0) {
      const taskId = `gather-wood-${tree.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanGatherWood,
        position: tree.position,
        creatorEntityId: tree.id,
        target: tree.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
};
