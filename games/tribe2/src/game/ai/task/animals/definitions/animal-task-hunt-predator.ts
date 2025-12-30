import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { Task, TaskType } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { MAX_TRIBE_ATTACKERS_PER_TARGET } from '../../../../ai-consts';

export const animalHuntPredatorProducer = (entity: PredatorEntity, context: UpdateContext): Record<string, Task> => {
  const tasks: Record<string, Task> = {};

  if (entity.hitpoints <= 0) {
    return tasks;
  }

  const targetEntity = entity.attackTargetId ? context.gameState.entities.entities[entity.attackTargetId] : undefined;
  const isAttackingHuman = targetEntity?.type === 'human';

  // A predator is a threat if it's attacking a human or is near the tribe's territory/members
  if (!isAttackingHuman) {
    return tasks;
  }

  for (let i = 0; i < MAX_TRIBE_ATTACKERS_PER_TARGET; i++) {
    const taskId = `hunt-predator-${entity.id}-${i}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.HumanHuntPredator,
      position: entity.position,
      creatorEntityId: entity.id,
      target: entity.id,
      validUntilTime: context.gameState.time + 1,
    };
  }

  return tasks;
};
