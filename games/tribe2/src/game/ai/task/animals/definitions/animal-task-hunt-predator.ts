import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { Task, TaskType } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { MAX_TRIBE_ATTACKERS_PER_TARGET } from '../../../../ai-consts';

export const animalHuntPredatorProducer = (entity: PredatorEntity, context: UpdateContext): Record<string, Task> => {
  const tasks: Record<string, Task> = {};
  
  for (let i = 0; i < MAX_TRIBE_ATTACKERS_PER_TARGET; i++) {
    const taskId = `hunt-predator-${entity.id}-${i}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.HumanHuntPredator,
      creatorEntityId: entity.id,
      target: entity.id,
      validUntilTime: context.gameState.time + 1,
    };
  }
  
  return tasks;
};
