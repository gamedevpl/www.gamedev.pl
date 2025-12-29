import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING } from '../../../../ai-consts';
import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { BuildingEntity, BuildingType } from '../../../../entities/buildings/building-types';
import { HUMAN_HUNGER_DEATH, HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskResult, TaskType } from '../../task-types';
import { defineHumanTask, getDistanceScore } from '../../task-utils';
import { IndexedWorldState } from '../../../../world-index/world-index-types';

/**
 * Task definition for humans to retrieve food from storage spots.
 */
export const humanRetrieveDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanRetrieve,
  requireAdult: false,
  autopilotBehavior: 'gathering',
  producer: (human, context) => {
    const tasks: Record<string, Task> = {};

    // Only produce if hungry and has no food
    if (human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING && human.food.length === 0) {
      const indexedState = context.gameState as IndexedWorldState;

      // Find tribe storage spots with food
      const storageSpots = indexedState.search.building
        .all()
        .filter(
          (b) =>
            b.buildingType === BuildingType.StorageSpot &&
            b.isConstructed &&
            b.ownerId === human.leaderId &&
            b.storedItems.some((si) => si.item.itemType === 'food'),
        );

      if (storageSpots.length > 0) {
        // Find closest one to target
        let closest = storageSpots[0];
        let minDist = Infinity;

        for (const spot of storageSpots) {
          const dist = calculateWrappedDistance(
            human.position,
            spot.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );
          if (dist < minDist) {
            minDist = dist;
            closest = spot;
          }
        }

        const taskId = `retrieve-${human.id}-${closest.id}`;
        tasks[taskId] = {
          id: taskId,
          type: TaskType.HumanRetrieve,
          creatorEntityId: human.id,
          target: closest.id,
          validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
        };
      }
    }

    return tasks;
  },
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') {
      return null;
    }

    const building = context.gameState.entities.entities[task.target] as BuildingEntity | undefined;
    if (
      !building ||
      building.type !== 'building' ||
      building.buildingType !== BuildingType.StorageSpot ||
      building.ownerId !== human.leaderId ||
      !building.storedItems.some((si) => si.item.itemType === 'food')
    ) {
      return null;
    }

    // Don't retrieve if already full
    if (human.food.length >= human.maxFood) {
      return null;
    }

    const distance = calculateWrappedDistance(
      human.position,
      building.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    const distanceFactor = getDistanceScore(distance);
    const hungerFactor = human.hunger / HUMAN_HUNGER_DEATH;

    // Prioritize based on hunger and proximity
    return (distanceFactor + hungerFactor) / 2;
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') {
      return TaskResult.Failure;
    }

    const building = context.gameState.entities.entities[task.target] as BuildingEntity | undefined;
    if (
      !building ||
      building.type !== 'building' ||
      building.buildingType !== BuildingType.StorageSpot ||
      !building.storedItems.some((si) => si.item.itemType === 'food')
    ) {
      return TaskResult.Failure;
    }

    // Success if human now has food
    if (human.food.length > 0) {
      return TaskResult.Success;
    }

    // Failure if human is full (shouldn't happen if food.length === 0, but safe)
    if (human.food.length >= human.maxFood) {
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

    // At the storage spot, start retrieving
    human.direction = { x: 0, y: 0 };
    human.target = building.id;
    human.activeAction = 'retrieving';

    return TaskResult.Running;
  },
});
