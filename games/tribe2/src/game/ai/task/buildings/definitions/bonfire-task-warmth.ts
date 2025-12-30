import { BuildingEntity, BuildingType } from '../../../../entities/buildings/building-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskType } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { BONFIRE_MAX_USERS } from '../../../../temperature/temperature-consts';

/**
 * Producer for bonfire warmth-seeking tasks.
 * Generates tasks for tribe members to gather around fueled bonfires.
 */
export const bonfireWarmthProducer = (
  building: BuildingEntity,
  context: UpdateContext,
): Record<string, Task> => {
  const tasks: Record<string, Task> = {};

  if (
    building.buildingType === BuildingType.Bonfire &&
    building.isConstructed &&
    !building.isBeingDestroyed &&
    (building.fuelLevel ?? 0) > 0
  ) {
    // Produce multiple tasks to allow multiple users to gather around the same bonfire
    for (let i = 0; i < BONFIRE_MAX_USERS; i++) {
      const taskId = `seek-warmth-${building.id}-${i}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanSeekWarmth,
        creatorEntityId: building.id,
        target: building.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }
  }

  return tasks;
};
