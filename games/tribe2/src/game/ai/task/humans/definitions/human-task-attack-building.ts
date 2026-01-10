import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TaskDefinition, TaskType, TaskResult } from '../../task-types';
import { EntityId } from '../../../../entities/entities-types';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { getDistanceScore } from '../../task-utils';
import { BuildingEntity } from '../../../../entities/buildings/building-types';

/**
 * Task definition for attacking a building.
 * This task is usually generated automatically when a path is blocked by an enemy fortification.
 */
export const humanAttackBuildingDefinition: TaskDefinition<HumanEntity> = {
  type: TaskType.HumanAttackBuilding,
  scorer: (human, task, context) => {
    // Immediate priority if this building is trapping the human
    if (human.trappedByObstacleId === task.target) {
      return 1000;
    }

    const targetId = task.target as EntityId;
    const target = context.gameState.entities.entities[targetId];

    if (!target) return null;

    // If not trapped, only attack enemy buildings
    // (Assuming 'ownerId' property exists on buildings, which it should)
    if ((target as BuildingEntity).ownerId === human.leaderId) {
      return null;
    }

    const distance = calculateWrappedDistance(
      human.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    return getDistanceScore(distance);
  },
  executor: (task, entity, context) => {
    const { gameState } = context;
    const targetId = task.target as EntityId;
    const target = gameState.entities.entities[targetId] as BuildingEntity | undefined;

    // If the target building no longer exists, the task is complete
    if (!target) {
      return TaskResult.Success;
    }

    // Set the human to attacking mode targeting the building
    entity.activeAction = 'attacking';
    entity.attackTargetId = targetId;

    // If this building is trapping the human, ensure it gets destroyed
    // This bypasses normal combat damage if needed to ensure unstuck
    if (entity.trappedByObstacleId === targetId) {
      target.isBeingDestroyed = true;
    }

    return TaskResult.Running;
  },
};
