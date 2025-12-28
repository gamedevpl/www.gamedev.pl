import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { UpdateContext } from '../../../world-types';
import { plantTaskDefinitions } from './definitions';

/**
 * Updates task production for a plant entity.
 * Iterates through all plant task definitions and allows the entity to produce tasks
 * if a producer is defined for that task type.
 */
export function updatePlantTaskAI(entity: BerryBushEntity, context: UpdateContext): void {
  for (const definition of Object.values(plantTaskDefinitions)) {
    if (definition.producer) {
      const producedTasks = definition.producer(entity, context);
      for (const [taskId, task] of Object.entries(producedTasks)) {
        // Only add if not already present or if we want to refresh it
        if (!context.gameState.tasks[taskId]) {
          context.gameState.tasks[taskId] = task;
        }
      }
    }
  }
}
