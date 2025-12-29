import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { BuildingEntity, BuildingType } from '../../../../entities/buildings/building-types';
import { ItemType } from '../../../../entities/item-types';
import { HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { TaskResult, TaskType } from '../../task-types';
import { defineHumanTask, getDistanceScore } from '../../task-utils';

/**
 * Task definition for humans to stockpile resources in storage spots.
 */
export const humanStockpileDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanStockpile,
  requireAdult: true,
  autopilotBehavior: 'gathering',
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') {
      return null;
    }

    const hasFood = human.food.length > 0;
    const hasWood = human.heldItem?.type === ItemType.Wood;

    // Human must have something to deposit
    if (!hasFood && !hasWood) {
      return null;
    }

    const building = context.gameState.entities.entities[task.target] as BuildingEntity | undefined;
    if (!building || building.type !== 'building' || building.buildingType !== BuildingType.StorageSpot) {
      return null;
    }

    // Must belong to the same tribe
    if (human.leaderId !== building.ownerId) {
      return null;
    }

    // Check if storage has capacity
    if (building.storedItems.length >= building.storageCapacity) {
      return null;
    }

    const distance = calculateWrappedDistance(
      human.position,
      building.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Distance factor: closer is better
    const distanceFactor = getDistanceScore(distance);

    // Resource factor: prioritize if holding wood or more food
    const resourceFactor = hasWood ? 0.6 : (human.food.length / human.maxFood) * 0.4;

    return (distanceFactor + resourceFactor) / 2;
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') {
      return TaskResult.Failure;
    }

    const building = context.gameState.entities.entities[task.target] as BuildingEntity | undefined;
    if (!building || building.type !== 'building' || building.buildingType !== BuildingType.StorageSpot) {
      return TaskResult.Failure;
    }

    const hasFood = human.food.length > 0;
    const hasWood = human.heldItem?.type === ItemType.Wood;

    // Task is done if human has nothing more to deposit
    if (!hasFood && !hasWood) {
      return TaskResult.Success;
    }

    // Fail if storage becomes full
    if (building.storedItems.length >= building.storageCapacity) {
      return TaskResult.Failure;
    }

    const distance = calculateWrappedDistance(
      human.position,
      building.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > HUMAN_INTERACTION_RANGE) {
      human.target = building.position;
      human.activeAction = 'moving';
      return TaskResult.Running;
    }

    // At the storage spot, start depositing
    human.direction = { x: 0, y: 0 };
    human.target = building.id;
    human.activeAction = 'depositing';

    return TaskResult.Running;
  },
});
