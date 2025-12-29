import { PlantEntity } from '../../../entities/plants/plant-types';
import { UpdateContext } from '../../../world-types';
import { plantTaskDefinitions } from './definitions';

/**
 * Updates task production for a plant entity.
 * Iterates through all plant task definitions and allows the entity to produce tasks
 * if a producer is defined for that task type.
 */
export function updatePlantTaskAI(entity: PlantEntity, context: UpdateContext): void {
  for (const definition of Object.values(plantTaskDefinitions)) {
    if (definition.producer) {
      const producedTasks = definition.producer(entity as any, context);
      for (const [taskId, task] of Object.entries(producedTasks)) {
        // Only add if not already present or if we want to refresh it
        if (!context.gameState.tasks[taskId]) {
          context.gameState.tasks[taskId] = task;
        }
      }
    }
  }
}
