import { BuildingEntity } from '../../../entities/buildings/building-types';
import { UpdateContext } from '../../../world-types';
import { buildingTaskDefinitions } from './definitions';

export function updateBuildingTaskAI(building: BuildingEntity, context: UpdateContext) {
  for (const definition of Object.values(buildingTaskDefinitions)) {
    if (definition && definition.producer) {
      const newTasks = definition.producer(building, context);
      Object.assign(context.gameState.tasks, newTasks);
    }
  }
}
