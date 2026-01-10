import { BuildingEntity } from '../../../../entities/buildings/building-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { plantingZoneTaskPlantProducer } from './planting-zone-task-plant';
import { storageStockpileProducer } from './storage-task-stockpile';
import { bonfireFuelProducer } from './bonfire-task-fuel';
import { bonfireWarmthProducer } from './bonfire-task-warmth';
import { storageRetrieveProducer } from './storage-task-retrieve';
import { buildingObstacleProducer } from './building-obstacle-producer';

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
  [TaskType.HumanSeekWarmth]: {
    type: TaskType.HumanSeekWarmth,
    producer: bonfireWarmthProducer,
  },
  [TaskType.HumanRetrieve]: {
    type: TaskType.HumanRetrieve,
    producer: storageRetrieveProducer,
  },
  [TaskType.HumanDismantleBuilding]: {
    type: TaskType.HumanDismantleBuilding,
    producer: buildingObstacleProducer,
  },
  [TaskType.HumanAttackBuilding]: {
    type: TaskType.HumanAttackBuilding,
    producer: buildingObstacleProducer,
  },
};
