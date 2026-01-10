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
  humanPlacePalisadeDefinition,
  humanPlaceGateDefinition,
} from './human-task-place-building';
import { humanPlantBushDefinition } from './human-task-plant-bush';
import { humanStockpileDefinition } from './human-task-stockpile';
import { humanFuelBonfireDefinition } from './human-task-fuel-bonfire';
import { humanRetrieveDefinition } from './human-task-retrieve';
import { humanChopTreeDefinition } from './human-task-chop-tree';
import { humanGatherWoodDefinition } from './human-task-gather-wood';
import { humanHuntPreyDefinition } from './human-task-hunt-prey';
import { humanHuntPredatorDefinition } from './human-task-hunt-predator';
import { humanPlayerCommandDefinition } from './human-task-player-command';
import { humanAttackHumanDefinition } from './human-task-attack-human';
import { humanSeekWarmthDefinition } from './human-task-seek-warmth';
import { humanFleeDefinition } from './human-task-flee';
import { humanStayNearTribeDefinition } from './human-task-stay-near-tribe';
import { humanStayNearParentDefinition } from './human-task-stay-near-parent';
import { humanDiplomacyDefinition } from './human-task-diplomacy';
import { humanAttackBuildingDefinition } from './human-task-attack-building';
import { humanDismantleBuildingDefinition } from './human-task-dismantle-building';

export const humanTaskDefinitions = [
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
  humanPlacePalisadeDefinition,
  humanPlaceGateDefinition,
  humanPlantBushDefinition,
  humanStockpileDefinition,
  humanFuelBonfireDefinition,
  humanRetrieveDefinition,
  humanChopTreeDefinition,
  humanGatherWoodDefinition,
  humanHuntPreyDefinition,
  humanHuntPredatorDefinition,
  humanPlayerCommandDefinition,
  humanAttackHumanDefinition,
  humanSeekWarmthDefinition,
  humanFleeDefinition,
  humanStayNearTribeDefinition,
  humanStayNearParentDefinition,
  humanDiplomacyDefinition,
  humanAttackBuildingDefinition,
  humanDismantleBuildingDefinition,
].reduce<Record<TaskType, TaskDefinition<HumanEntity>>>((acc, def) => {
  acc[def.type] = def;
  return acc;
}, {} as Record<TaskType, TaskDefinition<HumanEntity>>);

export const humanTaskDefinitionList = Object.values(humanTaskDefinitions);
