import { BuildingEntity, BuildingType } from '../../../../entities/buildings/building-types';
import { Task, TaskType } from '../../task-types';
import { UpdateContext } from '../../../../world-types';
import { calculatePlantingZoneCapacity, countBushesInZone } from '../../../../entities/tribe/tribe-food-utils';
import { isSoilDepleted } from '../../../../entities/plants/soil-depletion-update';
import { isPositionOccupied } from '../../../../utils/spatial-utils';
import { BERRY_BUSH_PLANTING_CLEARANCE_RADIUS } from '../../../../entities/plants/berry-bush/berry-bush-consts';
import { TASK_PLANTING_VALIDITY_TICKS } from '../../task-consts';

export const plantingZoneTaskPlantProducer = (
  building: BuildingEntity,
  context: UpdateContext,
): Record<string, Task> => {
  if (building.buildingType !== BuildingType.PlantingZone || !building.isConstructed) {
    return {};
  }

  const { gameState } = context;
  const capacity = calculatePlantingZoneCapacity(building);
  const currentCount = countBushesInZone(building, gameState);

  if (currentCount >= capacity) {
    return {};
  }

  // Find an existing task produced by this building
  const existingTask = Object.values(gameState.tasks).find(
    (t) => t.type === TaskType.HumanPlantBush && t.creatorEntityId === building.id,
  );

  if (existingTask) {
    return { [existingTask.id]: existingTask };
  }

  // Try to find a valid spot within this zone
  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;
  const soilDepletion = gameState.soilDepletion;

  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const randomX = building.position.x + (Math.random() - 0.5) * building.width;
    const randomY = building.position.y + (Math.random() - 0.5) * building.height;

    const position = {
      x: ((randomX % worldWidth) + worldWidth) % worldWidth,
      y: ((randomY % worldHeight) + worldHeight) % worldHeight,
    };

    if (isSoilDepleted(soilDepletion, position, worldWidth, worldHeight)) {
      continue;
    }

    if (!isPositionOccupied(position, gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS)) {
      const taskId = `plant-bush-${building.id}-${gameState.time}`;
      const task: Task = {
        id: taskId,
        type: TaskType.HumanPlantBush,
        position: position,
        creatorEntityId: building.id,
        target: position,
        validUntilTime: gameState.time + TASK_PLANTING_VALIDITY_TICKS,
      };
      return { [taskId]: task };
    }
  }

  return {};
};
