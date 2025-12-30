import { BuildingEntity, BuildingType } from '../../../../entities/buildings/building-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskType } from '../../task-types';
import { UpdateContext } from '../../../../world-types';

/**
 * Produces a retrieval task if the storage spot has food.
 */
export const storageRetrieveProducer = (building: BuildingEntity, context: UpdateContext): Record<string, Task> => {
  const tasks: Record<string, Task> = {};

  if (
    building.buildingType === BuildingType.StorageSpot &&
    building.isConstructed &&
    !building.isBeingDestroyed &&
    building.storedItems.some((si) => si.item.itemType === 'food')
  ) {
    const taskId = `retrieve-from-${building.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.HumanRetrieve,
      position: building.position,
      creatorEntityId: building.id,
      target: building.id,
      validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
    };
  }

  return tasks;
};
