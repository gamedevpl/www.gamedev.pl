import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { Task, TaskType } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { MAX_HUNTERS_PER_PREY } from '../../../../entities/tribe/tribe-task-utils';

export const animalHuntPreyProducer = (entity: PreyEntity, context: UpdateContext): Record<string, Task> => {
  const tasks: Record<string, Task> = {};
  
  for (let i = 0; i < MAX_HUNTERS_PER_PREY; i++) {
    const taskId = `hunt-prey-${entity.id}-${i}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.HumanHuntPrey,
      creatorEntityId: entity.id,
      target: entity.id,
      validUntilTime: context.gameState.time + 1,
    };
  }
  
  return tasks;
};
