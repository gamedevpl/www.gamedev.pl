import { BuildingEntity } from '../../../../entities/buildings/building-types';
import { UpdateContext } from '../../../../world-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskType } from '../../task-types';
import { IndexedWorldState } from '../../../../world-index/world-index-types';

export const buildingObstacleProducer = (building: BuildingEntity, context: UpdateContext): Record<string, Task> => {
  const tasks: Record<string, Task> = {};
  const indexedState = context.gameState as IndexedWorldState;

  // Search for any nearby human trapped by this specific building
  const nearbyHumans = indexedState.search.human.byRadius(building.position, 100);
  const trappedHuman = nearbyHumans.find(h => h.trappedByObstacleId === building.id);

  if (trappedHuman) {
    const isOwnBuilding = trappedHuman.leaderId === building.ownerId;
    const taskType = isOwnBuilding ? TaskType.HumanDismantleBuilding : TaskType.HumanAttackBuilding;
    const taskId = `clear-obstacle-${building.id}`;

    tasks[taskId] = {
      id: taskId,
      type: taskType,
      position: building.position,
      creatorEntityId: building.id,
      target: building.id,
      validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
    };
  }
  return tasks;
};
