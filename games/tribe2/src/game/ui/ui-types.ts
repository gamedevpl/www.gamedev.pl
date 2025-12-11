import { HumanAction } from '../entities/characters/human/human-types';
import { Entity, EntityId } from '../entities/entities-types';
import { TribeRole } from '../entities/tribe/tribe-types';
import { DiplomacyStatus } from '../world-types';

export enum PlayerActionType {
  Gather = 'Gather',
  Eat = 'Eat',
  Procreate = 'Procreate',
  Attack = 'Attack',
  Plant = 'Plant',
  CallToAttack = 'CallToAttack',
  TribeSplit = 'TribeSplit',
  FollowMe = 'FollowMe',
  FeedChild = 'FeedChild',
  HuntPrey = 'HuntPrey',
  DefendAgainstPredator = 'DefendAgainstPredator',
  Build = 'Build',
  Removal = 'Removal',
  Deposit = 'Deposit',
  Retrieve = 'Retrieve',
  TakeOverBuilding = 'TakeOverBuilding',
  RemoveEnemyBuilding = 'RemoveEnemyBuilding',
  // Autopilot specific
  AutopilotMove = 'AutopilotMove',
  AutopilotGather = 'AutopilotGather',
  AutopilotAttack = 'AutopilotAttack',
  AutopilotProcreate = 'AutopilotProcreate',
  AutopilotPlant = 'AutopilotPlant',
  AutopilotFeedChild = 'AutopilotFeedChild',
  AutopilotFollowMe = 'AutopilotFollowMe',
  AutopilotDeposit = 'AutopilotDeposit',
  AutopilotRetrieve = 'AutopilotRetrieve',
}

export const PLAYER_ACTION_EMOJIS: Record<PlayerActionType, string> = {
  [PlayerActionType.Gather]: '✋',
  [PlayerActionType.Eat]: '🍖',
  [PlayerActionType.Procreate]: '❤️',
  [PlayerActionType.Attack]: '⚔️',
  [PlayerActionType.Plant]: '🌱',
  [PlayerActionType.CallToAttack]: '📢',
  [PlayerActionType.TribeSplit]: '🔱',
  [PlayerActionType.FollowMe]: '➡️',
  [PlayerActionType.FeedChild]: '👨‍👧',
  [PlayerActionType.HuntPrey]: '🏹',
  [PlayerActionType.DefendAgainstPredator]: '🛡️',
  [PlayerActionType.Build]: '🏗️',
  [PlayerActionType.Removal]: '❌',
  [PlayerActionType.Deposit]: '📦',
  [PlayerActionType.Retrieve]: '🎁',
  [PlayerActionType.TakeOverBuilding]: '🏴',
  [PlayerActionType.RemoveEnemyBuilding]: '🧨',
  [PlayerActionType.AutopilotMove]: '🎯',
  [PlayerActionType.AutopilotGather]: '✋',
  [PlayerActionType.AutopilotAttack]: '⚔️',
  [PlayerActionType.AutopilotProcreate]: '❤️',
  [PlayerActionType.AutopilotPlant]: '🌱',
  [PlayerActionType.AutopilotFeedChild]: '👨‍👧',
  [PlayerActionType.AutopilotFollowMe]: '➡️',
  [PlayerActionType.AutopilotDeposit]: '📦',
  [PlayerActionType.AutopilotRetrieve]: '🎁',
};

export const PLAYER_ACTION_NAMES: Record<PlayerActionType, string> = {
  [PlayerActionType.Gather]: 'Gather',
  [PlayerActionType.Eat]: 'Eat',
  [PlayerActionType.Procreate]: 'Procreate',
  [PlayerActionType.Attack]: 'Attack',
  [PlayerActionType.Plant]: 'Plant',
  [PlayerActionType.CallToAttack]: 'Call to Attack',
  [PlayerActionType.TribeSplit]: 'Split Tribe',
  [PlayerActionType.FollowMe]: 'Follow Me',
  [PlayerActionType.FeedChild]: 'Feed Child',
  [PlayerActionType.HuntPrey]: 'Hunt Prey',
  [PlayerActionType.DefendAgainstPredator]: 'Defend',
  [PlayerActionType.Build]: 'Build',
  [PlayerActionType.Removal]: 'Remove',
  [PlayerActionType.Deposit]: 'Deposit',
  [PlayerActionType.Retrieve]: 'Retrieve',
  [PlayerActionType.TakeOverBuilding]: 'Take Over',
  [PlayerActionType.RemoveEnemyBuilding]: 'Destroy Enemy Building',
  [PlayerActionType.AutopilotMove]: 'Walk',
  [PlayerActionType.AutopilotGather]: 'Gather',
  [PlayerActionType.AutopilotAttack]: 'Attack',
  [PlayerActionType.AutopilotProcreate]: 'Procreate',
  [PlayerActionType.AutopilotPlant]: 'Plant',
  [PlayerActionType.AutopilotFeedChild]: 'Feed',
  [PlayerActionType.AutopilotFollowMe]: 'Follow',
  [PlayerActionType.AutopilotDeposit]: 'Deposit',
  [PlayerActionType.AutopilotRetrieve]: 'Retrieve',
};

export const TRIBE_ROLE_EMOJIS: Record<TribeRole, string> = {
  [TribeRole.Leader]: '👑',
  [TribeRole.Gatherer]: '🧺',
  [TribeRole.Planter]: '🌱',
  [TribeRole.Hunter]: '🏹',
  [TribeRole.Mover]: '📦',
  [TribeRole.Warrior]: '⚔️',
};

export const TRIBE_ROLE_NAMES: Record<TribeRole, string> = {
  [TribeRole.Leader]: 'Leader',
  [TribeRole.Gatherer]: 'Gatherer',
  [TribeRole.Planter]: 'Planter',
  [TribeRole.Hunter]: 'Hunter',
  [TribeRole.Mover]: 'Mover',
  [TribeRole.Warrior]: 'Warrior',
};

export interface PlayerActionHint {
  type: PlayerActionType;
  action: HumanAction;
  key: string;
  targetEntity?: Entity;
}

export interface TribeInfo {
  leaderId: EntityId;
  tribeBadge: string;
  adultCount: number;
  childCount: number;
  isPlayerTribe: boolean;
  leaderAge: number;
  leaderGender: 'male' | 'female';
  diplomacyStatus?: DiplomacyStatus;
}

export enum UIStatusType {
  Time = 'Time',
  Hunger = 'Hunger',
  Hitpoints = 'Hitpoints',
  Food = 'Food',
  // Age = 'Age',
  Autopilot = 'Autopilot',
  Muted = 'Muted',
  Family = 'Family',
  Tribes = 'Tribes',
}

export const UI_STATUS_EMOJIS: Record<UIStatusType, string> = {
  [UIStatusType.Time]: '🗓️',
  [UIStatusType.Hunger]: '🍖',
  [UIStatusType.Hitpoints]: '❤️',
  [UIStatusType.Food]: '🍓',
  [UIStatusType.Autopilot]: '🤖',
  [UIStatusType.Muted]: '🔇',
  [UIStatusType.Family]: '👨‍👩‍👧‍👦',
  [UIStatusType.Tribes]: '🛖',
};

export enum UIButtonActionType {
  // System Controls
  ToggleMute = 'ToggleMute',
  TogglePause = 'TogglePause',
  FastForward = 'FastForward',
  DismissTutorial = 'DismissTutorial',
  ReturnToIntro = 'ReturnToIntro',
  ConfirmExitYes = 'ConfirmExitYes',
  ConfirmExitNo = 'ConfirmExitNo',

  // --- Player Commands (One-Time Actions) ---
  CommandEat = 'CommandEat',
  CommandPlant = 'CommandPlant',
  CommandCallToAttack = 'CommandCallToAttack',
  CommandFollowMe = 'CommandFollowMe',
  CommandGather = 'CommandGather',
  CommandTribeSplit = 'CommandTribeSplit',
  CommandBuild = 'CommandBuild',
  SelectStorageSpot = 'SelectStorageSpot',
  SelectPlantingZone = 'SelectPlantingZone',
  SelectRemovalTool = 'SelectRemovalTool',

  // --- Autopilot Behavior Toggles ---
  // These are behaviors that can be toggled on/off for the AI
  ToggleProcreationBehavior = 'ToggleProcreationBehavior',
  ToggleAttackBehavior = 'ToggleAttackBehavior',
  ToggleFeedChildBehavior = 'ToggleFeedChildBehavior',
  TogglePlantingBehavior = 'TogglePlantingBehavior',
  ToggleGatheringBehavior = 'ToggleGatheringBehavior',
  ToggleAutopilotFollowLeaderBehavior = 'ToggleAutopilotFollowLeaderBehavior',

  // --- Diplomacy ---
  ToggleDiplomacy = 'ToggleDiplomacy',

  // --- Tribe Role Manager ---
  OpenRoleManager = 'OpenRoleManager',
  CloseRoleManager = 'CloseRoleManager',
  IncreaseRoleWeight = 'IncreaseRoleWeight',
  DecreaseRoleWeight = 'DecreaseRoleWeight',
}

export interface ClickableUIButton {
  id: string;
  action: UIButtonActionType;
  currentWidth: number;
  rect: { x: number; y: number; width: number; height: number };
  text: string;
  icon?: string;
  backgroundColor: string;
  textColor: string;
  tooltip?: string;
  isDisabled?: boolean;
  lastActivated?: number;
  activated?: boolean;
  targetTribeId?: EntityId;
  targetRole?: TribeRole;
}
