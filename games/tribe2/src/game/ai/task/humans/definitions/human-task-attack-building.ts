import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TaskDefinition, TaskType, TaskResult } from '../../task-types';
import { EntityId } from '../../../../entities/entities-types';

/**
 * Task definition for attacking a building.
 * This task is usually generated automatically when a path is blocked by an enemy fortification.
 */
export const humanAttackBuildingDefinition: TaskDefinition<HumanEntity> = {
  type: TaskType.HumanAttackBuilding,
  executor: (task, entity, context) => {
    const { gameState } = context;
    const targetId = task.target as EntityId;
    const target = gameState.entities.entities[targetId];

    // If the target building no longer exists, the task is complete
    if (!target) {
      return TaskResult.Success;
    }

    // Set the human to attacking mode targeting the building
    entity.activeAction = 'attacking';
    entity.attackTargetId = targetId;

    return TaskResult.Running;
  },
};
