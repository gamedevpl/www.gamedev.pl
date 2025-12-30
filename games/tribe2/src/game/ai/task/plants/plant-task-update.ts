import { PlantEntity } from '../../../entities/plants/plant-types';
import { UpdateContext } from '../../../world-types';
import { produceEntityTasks } from '../task-utils';
import { plantTaskDefinitions } from './definitions';

/**
 * Updates task production for a plant entity.
 * Iterates through all plant task definitions and allows the entity to produce tasks
 * if a producer is defined for that task type.
 */
export function preparePlantTaskAI(entity: PlantEntity, context: UpdateContext): void {
  produceEntityTasks<PlantEntity>(entity, context, Object.values(plantTaskDefinitions));
}
