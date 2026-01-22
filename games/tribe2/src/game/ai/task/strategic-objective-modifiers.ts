import { StrategicObjective } from '../../entities/tribe/tribe-types';
import { TaskType } from './task-types';

/**
 * Defines score multipliers for each strategic objective.
 * Tasks that are relevant to the current strategic objective will have their scores multiplied.
 * A multiplier of 1.0 means no change, >1.0 means increased priority, <1.0 means decreased priority.
 */
export type StrategicModifierMap = Partial<Record<TaskType, number>>;

/**
 * Strategic objective modifiers for different objectives.
 * Each objective defines which task types should be prioritized (multiplied > 1)
 * or de-prioritized (multiplied < 1).
 */
export const STRATEGIC_OBJECTIVE_MODIFIERS: Record<StrategicObjective, StrategicModifierMap> = {
  [StrategicObjective.None]: {},

  [StrategicObjective.GreatHarvest]: {
    [TaskType.HumanGatherBerries]: 2.0,
    [TaskType.HumanGatherMeat]: 1.5,
    [TaskType.HumanStockpile]: 1.5,
    [TaskType.HumanRetrieve]: 0.8,
    [TaskType.HumanChopTree]: 0.7,
    [TaskType.HumanPlantBush]: 0.8,
  },

  [StrategicObjective.GreenThumb]: {
    [TaskType.HumanPlantBush]: 2.5,
    [TaskType.HumanGatherBerries]: 1.2,
    [TaskType.HumanChopTree]: 0.6,
  },

  [StrategicObjective.LumberjackFever]: {
    [TaskType.HumanChopTree]: 2.5,
    [TaskType.HumanGatherWood]: 2.0,
    [TaskType.HumanStockpile]: 1.5,
    [TaskType.HumanFuelBonfire]: 1.3,
  },

  [StrategicObjective.WinterPrep]: {
    [TaskType.HumanFuelBonfire]: 2.5,
    [TaskType.HumanChopTree]: 2.0,
    [TaskType.HumanGatherWood]: 2.0,
    [TaskType.HumanStockpile]: 1.5,
    [TaskType.HumanSeekWarmth]: 1.5,
  },

  [StrategicObjective.BabyBoom]: {
    [TaskType.HumanProcreateFemale]: 2.5,
    [TaskType.HumanProcreateMale]: 2.5,
    [TaskType.HumanFeedChild]: 2.0,
    [TaskType.HumanGatherBerries]: 1.3,
    [TaskType.HumanGatherMeat]: 1.3,
  },

  [StrategicObjective.ManifestDestiny]: {
    [TaskType.HumanPlaceBorderPost]: 2.0,
    [TaskType.HumanChopTree]: 1.3,
    [TaskType.HumanPlaceStorage]: 1.5,
  },

  [StrategicObjective.IronCurtain]: {
    [TaskType.HumanPlacePalisade]: 2.5,
    [TaskType.HumanPlaceGate]: 2.5,
    [TaskType.HumanChopTree]: 1.5,
    [TaskType.HumanGatherWood]: 1.5,
    [TaskType.HumanPlaceBorderPost]: 0.5,
  },

  [StrategicObjective.Warpath]: {
    [TaskType.HumanAttackHuman]: 2.5,
    [TaskType.HumanAttackBuilding]: 2.0,
    [TaskType.HumanHuntPredator]: 1.5,
    [TaskType.HumanFlee]: 0.3,
    [TaskType.HumanStayNearTribe]: 0.5,
  },

  [StrategicObjective.ActiveDefense]: {
    [TaskType.HumanAttackHuman]: 1.8,
    [TaskType.HumanPlacePalisade]: 1.5,
    [TaskType.HumanPlaceGate]: 1.5,
    [TaskType.HumanStayNearTribe]: 1.5,
    [TaskType.HumanPlaceBorderPost]: 0.7,
  },

  [StrategicObjective.RaidingParty]: {
    [TaskType.HumanAttackBuilding]: 2.5,
    [TaskType.HumanAttackHuman]: 1.5,
    [TaskType.HumanDismantleBuilding]: 2.0,
    [TaskType.HumanStayNearTribe]: 0.5,
    [TaskType.HumanFlee]: 0.5,
  },
};

/**
 * Gets the score modifier for a specific task type given the current strategic objective.
 * Returns 1.0 if no modifier is defined (no change to base score).
 */
export function getStrategicModifier(objective: StrategicObjective | undefined, taskType: TaskType): number {
  if (!objective || objective === StrategicObjective.None) {
    return 1.0;
  }

  const modifiers = STRATEGIC_OBJECTIVE_MODIFIERS[objective];
  return modifiers[taskType] ?? 1.0;
}
