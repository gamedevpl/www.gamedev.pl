import { BuildingEntity, BuildingType } from '../../../../entities/buildings/building-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskType } from '../../task-types';
import { UpdateContext } from '../../../../world-types';

export const storageStockpileProducer = (
  building: BuildingEntity,
  context: UpdateContext,
): Record<string, Task> => {
  const tasks: Record<string, Task> = {};

  if (
    building.buildingType === BuildingType.StorageSpot &&
    building.isConstructed &&
    !building.isBeingDestroyed &&
    building.storedItems.length < building.storageCapacity
  ) {
    const taskId = `stockpile-${building.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.HumanStockpile,
      creatorEntityId: building.id,
      target: building.id,
      validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
    };
  }

  return tasks;
};
