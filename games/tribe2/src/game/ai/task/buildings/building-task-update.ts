import { BuildingEntity } from '../../../entities/buildings/building-types';
import { UpdateContext } from '../../../world-types';
import { buildingTaskDefinitions } from './definitions';

export function updateBuildingTaskAI(building: BuildingEntity, context: UpdateContext) {
  for (const definition of Object.values(buildingTaskDefinitions)) {
    if (definition && definition.producer) {
      const newTasks = definition.producer(building, context);
      for (const [taskId, task] of Object.entries(newTasks)) {
        // Only add if the task doesn't already exist to avoid overwriting claims
        if (!context.gameState.tasks[taskId]) {
          context.gameState.tasks[taskId] = task;
        }
      }
    }
  }
}
