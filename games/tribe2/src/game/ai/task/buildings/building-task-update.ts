import { BuildingEntity } from '../../../entities/buildings/building-types';
import { UpdateContext } from '../../../world-types';
import { produceEntityTasks } from '../task-utils';
import { buildingTaskDefinitions } from './definitions';

export function prepareBuildingTaskAI(building: BuildingEntity, context: UpdateContext) {
  produceEntityTasks<BuildingEntity>(building, context, Object.values(buildingTaskDefinitions));
}
