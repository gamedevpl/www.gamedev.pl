import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { BuildingEntity, BuildingType } from '../../../../entities/buildings/building-types';
import { ItemType } from '../../../../entities/item-types';
import { HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { TaskResult, TaskType } from '../../task-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask } from '../human-task-utils';
import { BONFIRE_STORAGE_CAPACITY } from '../../../../temperature/temperature-consts';

/**
 * Task definition for humans to fuel bonfires with wood.
 */
export const humanFuelBonfireDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanFuelBonfire,
  requireAdult: true,
  autopilotBehavior: 'gathering',
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') {
      return null;
    }

    const hasWood = human.heldItem?.type === ItemType.Wood;
    if (!hasWood) {
      return null;
    }

    const building = context.gameState.entities.entities[task.target] as BuildingEntity | undefined;
    if (!building || building.type !== 'building' || building.buildingType !== BuildingType.Bonfire) {
      return null;
    }

    // Must belong to the same tribe
    if (human.leaderId !== building.ownerId) {
      return null;
    }

    // Check if bonfire storage queue has capacity
    const capacity = building.storageCapacity || BONFIRE_STORAGE_CAPACITY;
    if (building.storedItems.length >= capacity) {
      return null;
    }

    const distance = calculateWrappedDistance(
      human.position,
      building.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Distance factor: closer is better
    return getDistanceScore(distance);
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') {
      return TaskResult.Failure;
    }

    const building = context.gameState.entities.entities[task.target] as BuildingEntity | undefined;
    if (!building || building.type !== 'building' || building.buildingType !== BuildingType.Bonfire) {
      return TaskResult.Failure;
    }

    const hasWood = human.heldItem?.type === ItemType.Wood;
    if (!hasWood) {
      // Task is done if wood is gone
      return TaskResult.Success;
    }

    // Fail if bonfire storage becomes full
    const capacity = building.storageCapacity || BONFIRE_STORAGE_CAPACITY;
    if (building.storedItems.length >= capacity) {
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

    // At the bonfire, start depositing
    human.direction = { x: 0, y: 0 };
    human.target = building.id;
    human.activeAction = 'depositing';

    return TaskResult.Running;
  },
});
