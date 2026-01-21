import { DiplomacyStatus } from '../../world-types';
import { EntityId } from '../entities-types';

/**
 * Strategic objectives that a tribe leader can set to guide their tribe's behavior.
 */
export enum StrategicObjective {
  None = 'None',
  GreatHarvest = 'GreatHarvest',
  GreenThumb = 'GreenThumb',
  LumberjackFever = 'LumberjackFever',
  WinterPrep = 'WinterPrep',
  BabyBoom = 'BabyBoom',
  ManifestDestiny = 'ManifestDestiny',
  IronCurtain = 'IronCurtain',
  Warpath = 'Warpath',
  ActiveDefense = 'ActiveDefense',
  RaidingParty = 'RaidingParty',
}

/**
 * Tribe control
 */
export type TribeControl = {
  diplomacy: Record<EntityId, DiplomacyStatus>; // LeaderId -> Status
  /** Flag to halt territory expansion when defensive walls are needed. */
  stopExpansion?: boolean;
  strategicObjective?: StrategicObjective;
};
