import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TaskResult, TaskType } from '../../task-types';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask } from '../human-task-utils';
import { EntityId } from '../../../../entities/entities-types';
import { BuildingEntity } from '../../../../entities/buildings/building-types';

export const humanDismantleBuildingDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanDismantleBuilding,
  requireAdult: true,

  scorer: (human, task, context) => {
    // Immediate priority if this building is trapping the human
    if (human.trappedByObstacleId === task.target) {
      return 1000;
    }

    // Only dismantle own tribe's buildings
    if (human.leaderId !== task.creatorEntityId) {
      return null;
    }

    const targetId = task.target as EntityId;
    const targetBuilding = context.gameState.entities.entities[targetId];
    if (!targetBuilding) return null;

    const distance = calculateWrappedDistance(
      human.position,
      targetBuilding.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    return getDistanceScore(distance);
  },

  executor: (task, human, context) => {
    const targetId = task.target as EntityId;
    const targetBuilding = context.gameState.entities.entities[targetId] as BuildingEntity | undefined;

    if (!targetBuilding) {
      human.activeAction = 'idle';
      return TaskResult.Success;
    }

    // Proximity check (20px range)
    const distance = calculateWrappedDistance(
      human.position,
      targetBuilding.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > 20) {
      human.target = targetBuilding.position;
      human.activeAction = 'moving';
      return TaskResult.Running;
    }

    // At target, start dismantling
    human.activeAction = 'dismantling';
    human.target = targetBuilding.id;
    
    // Ensure the building knows it's being destroyed so buildingUpdate() processes it
    targetBuilding.isBeingDestroyed = true;

    // Return Running so the human stays dedicated to this building until it's gone
    return TaskResult.Running;
  },
});
