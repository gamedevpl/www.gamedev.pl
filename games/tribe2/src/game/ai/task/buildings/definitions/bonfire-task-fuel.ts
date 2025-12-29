import { BuildingEntity, BuildingType } from '../../../../entities/buildings/building-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskType } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { BONFIRE_REFUEL_THRESHOLD_RATIO } from '../../../../temperature/temperature-consts';

export const bonfireFuelProducer = (
  building: BuildingEntity,
  context: UpdateContext,
): Record<string, Task> => {
  const tasks: Record<string, Task> = {};

  if (
    building.buildingType === BuildingType.Bonfire &&
    building.isConstructed &&
    !building.isBeingDestroyed &&
    building.fuelLevel !== undefined &&
    building.maxFuelLevel !== undefined &&
    building.fuelLevel < building.maxFuelLevel * BONFIRE_REFUEL_THRESHOLD_RATIO
  ) {
    const taskId = `fuel-bonfire-${building.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.HumanFuelBonfire,
      creatorEntityId: building.id,
      target: building.id,
      validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
    };
  }

  return tasks;
};
