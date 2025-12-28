import { CorpseEntity } from '../../../../entities/characters/corpse-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskDefinition, TaskType } from '../../task-types';

export const corpseGatherProducer: TaskDefinition<CorpseEntity> = {
  type: TaskType.HumanGatherMeat,
  producer: (corpse, context) => {
    const tasks: Record<string, Task> = {};

    if (corpse.food.length > 0) {
      const taskId = `gather-meat-${corpse.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanGatherMeat,
        creatorEntityId: corpse.id,
        target: corpse.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
};
