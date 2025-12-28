import { BerryBushEntity } from '../../../../entities/plants/berry-bush/berry-bush-types';
import { UpdateContext } from '../../../../world-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskDefinition, TaskType } from '../../task-types';

export const berryBushGatherProducer: TaskDefinition<BerryBushEntity> = {
  type: TaskType.HumanGatherBerries,
  producer: (bush: BerryBushEntity, context: UpdateContext) => {
    const tasks: Record<string, Task> = {};

    if (bush.food.length > 0) {
      const taskId = `gather-berries-${bush.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanGatherBerries,
        creatorEntityId: bush.id,
        target: bush.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
};
