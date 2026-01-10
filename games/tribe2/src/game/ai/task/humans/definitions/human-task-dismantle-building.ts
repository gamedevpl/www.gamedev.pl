import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TaskResult, TaskType } from '../../task-types';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask } from '../human-task-utils';
import { EntityId } from '../../../../entities/entities-types';

export const humanDismantleBuildingDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanDismantleBuilding,
  requireAdult: true,

  scorer: (human, task, context) => {
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
    const targetBuilding = context.gameState.entities.entities[targetId];

    if (!targetBuilding) {
      return TaskResult.Failure;
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
    return TaskResult.Success;
  },
});
