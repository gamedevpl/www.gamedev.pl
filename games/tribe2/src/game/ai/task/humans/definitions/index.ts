import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { humanEatDefinition } from './human-task-eat';
import { humanGatherBerriesDefinition } from './human-task-gather-berries';
import { humanGatherMeatDefinition } from './human-task-gather-meat';
import { humanProcreateFemaleDefinition } from './human-task-procreate-female';
import { humanProcreateMaleDefinition } from './human-task-procreate-male';
import { humanFeedChildDefinition } from './human-task-feed-child';
import {
  humanPlaceStorageDefinition,
  humanPlaceBonfireDefinition,
  humanPlacePlantingZoneDefinition,
  humanPlaceBorderPostDefinition,
} from './human-task-place-building';
import { humanPlantBushDefinition } from './human-task-plant-bush';
import { humanStockpileDefinition } from './human-task-stockpile';
import { humanFuelBonfireDefinition } from './human-task-fuel-bonfire';
import { humanRetrieveDefinition } from './human-task-retrieve';

export const humanTaskDefinitions: Record<TaskType, TaskDefinition<HumanEntity>> = [
  humanEatDefinition,
  humanGatherBerriesDefinition,
  humanGatherMeatDefinition,
  humanProcreateFemaleDefinition,
  humanProcreateMaleDefinition,
  humanFeedChildDefinition,
  humanPlaceStorageDefinition,
  humanPlaceBonfireDefinition,
  humanPlacePlantingZoneDefinition,
  humanPlaceBorderPostDefinition,
  humanPlantBushDefinition,
  humanStockpileDefinition,
  humanFuelBonfireDefinition,
  humanRetrieveDefinition,
].reduce<Record<TaskType, TaskDefinition<HumanEntity>>>((acc, def) => {
  acc[def.type] = def;
  return acc;
}, {} as Record<TaskType, TaskDefinition<HumanEntity>>);
