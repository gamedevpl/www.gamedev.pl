import { BuildingEntity } from '../../../../entities/buildings/building-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { plantingZoneTaskPlantProducer } from './planting-zone-task-plant';
import { storageStockpileProducer } from './storage-task-stockpile';
import { bonfireFuelProducer } from './bonfire-task-fuel';

export const buildingTaskDefinitions: Partial<Record<TaskType, TaskDefinition<BuildingEntity>>> = {
  [TaskType.HumanPlantBush]: {
    type: TaskType.HumanPlantBush,
    producer: plantingZoneTaskPlantProducer,
  },
  [TaskType.HumanStockpile]: {
    type: TaskType.HumanStockpile,
    producer: storageStockpileProducer,
  },
  [TaskType.HumanFuelBonfire]: {
    type: TaskType.HumanFuelBonfire,
    producer: bonfireFuelProducer,
  },
};
