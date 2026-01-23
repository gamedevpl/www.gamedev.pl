import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TaskResult, TaskType } from '../../task-types';
import { FoodType } from '../../../../entities/food-types';
import { BERRY_COST_FOR_PLANTING } from '../../../../entities/plants/berry-bush/berry-bush-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { Vector2D } from '../../../../utils/math-types';
import { BuildingEntity } from '../../../../entities/buildings/building-types';
import { HUMAN_INTERACTION_PROXIMITY } from '../../../../human-consts';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask, getStrategyMultiplier } from '../human-task-utils';
import { StrategicObjective } from '../../../../entities/tribe/tribe-types';
import { TASK_PLANTING_COMPLETION_RADIUS } from '../../task-consts';

export const humanPlantBushDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanPlantBush,
  requireAdult: true,
  scorer: (human, task, context) => {
    const berries = human.food.filter((f) => f.type === FoodType.Berry).length;
    if (berries < BERRY_COST_FOR_PLANTING) return null;

    // Check if human belongs to the same tribe as the building that produced the task
    const creatorBuilding = context.gameState.entities.entities[task.creatorEntityId] as BuildingEntity | undefined;
    if (!creatorBuilding || creatorBuilding.type !== 'building' || !creatorBuilding.ownerId) return null;

    const buildingOwner = context.gameState.entities.entities[creatorBuilding.ownerId] as HumanEntity | undefined;
    if (!buildingOwner || buildingOwner.leaderId !== human.leaderId) return null;

    const targetPos = task.target as Vector2D;
    const distance = calculateWrappedDistance(
      human.position,
      targetPos,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Normalized distance score (0 to 1)
    const baseScore = getDistanceScore(distance);
    return baseScore * getStrategyMultiplier(human, context, StrategicObjective.GreenThumb, 4.0);
  },
  executor: (task, human, context) => {
    // Check if we still have enough berries
    const berries = human.food.filter((f) => f.type === FoodType.Berry).length;
    if (berries < BERRY_COST_FOR_PLANTING) {
      human.activeAction = 'idle';
      return TaskResult.Failure;
    }

    const targetPos = task.target as Vector2D;
    const distance = calculateWrappedDistance(
      human.position,
      targetPos,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > HUMAN_INTERACTION_PROXIMITY) {
      human.target = targetPos;
      human.activeAction = 'moving';
      return TaskResult.Running;
    }

    if (human.activeAction !== 'planting') {
      human.activeAction = 'planting';
      human.target = targetPos;
    }

    // Check if a bush was created at the target position
    const bushAtTarget = Object.values(context.gameState.entities.entities).find(
      (e) =>
        e.type === 'berryBush' &&
        calculateWrappedDistance(
          e.position,
          targetPos,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        ) < TASK_PLANTING_COMPLETION_RADIUS,
    );

    if (bushAtTarget) {
      human.activeAction = 'idle';
      return TaskResult.Success;
    }

    return TaskResult.Running;
  },
});
