import { HumanAction } from '../entities/characters/human/human-types';
import { Entity, EntityId } from '../entities/entities-types';

export enum PlayerActionType {
  GatherFood = 'GatherFood',
  Eat = 'Eat',
  Procreate = 'Procreate',
  Attack = 'Attack',
  PlantBush = 'PlantBush',
  CallToAttack = 'CallToAttack',
  TribeSplit = 'TribeSplit',
  FeedChildren = 'FeedChildren',
  // Autopilot specific
  AutopilotMove = 'AutopilotMove',
  AutopilotGather = 'AutopilotGather',
  AutopilotAttack = 'AutopilotAttack',
  AutopilotProcreate = 'AutopilotProcreate',
  AutopilotPlant = 'AutopilotPlant',
  AutopilotFeedChildren = 'AutopilotFeedChildren',
}

export const PLAYER_ACTION_EMOJIS: Record<PlayerActionType, string> = {
  [PlayerActionType.GatherFood]: '✋',
  [PlayerActionType.Eat]: '🍖',
  [PlayerActionType.Procreate]: '❤️',
  [PlayerActionType.Attack]: '⚔️',
  [PlayerActionType.PlantBush]: '🌱',
  [PlayerActionType.CallToAttack]: '📢',
  [PlayerActionType.TribeSplit]: '🔱',
  [PlayerActionType.FeedChildren]: '👨‍👧',
  [PlayerActionType.AutopilotMove]: '🎯',
  [PlayerActionType.AutopilotGather]: '👇',
  [PlayerActionType.AutopilotAttack]: '⚔️',
  [PlayerActionType.AutopilotProcreate]: '❤️',
  [PlayerActionType.AutopilotPlant]: '🌱',
  [PlayerActionType.AutopilotFeedChildren]: '👨‍👧',
};

export const PLAYER_ACTION_NAMES: Record<PlayerActionType, string> = {
  [PlayerActionType.GatherFood]: 'Gather',
  [PlayerActionType.Eat]: 'Eat',
  [PlayerActionType.Procreate]: 'Procreate',
  [PlayerActionType.Attack]: 'Attack',
  [PlayerActionType.PlantBush]: 'Plant',
  [PlayerActionType.CallToAttack]: 'Call to Attack',
  [PlayerActionType.TribeSplit]: 'Split Tribe',
  [PlayerActionType.FeedChildren]: 'Feed',
  [PlayerActionType.AutopilotMove]: 'Walk',
  [PlayerActionType.AutopilotGather]: 'Gather',
  [PlayerActionType.AutopilotAttack]: 'Attack',
  [PlayerActionType.AutopilotProcreate]: 'Procreate',
  [PlayerActionType.AutopilotPlant]: 'Plant',
  [PlayerActionType.AutopilotFeedChildren]: 'Feed',
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
  ToggleAutopilot = 'ToggleAutopilot',
  ToggleMute = 'ToggleMute',
  TogglePause = 'TogglePause',
  ToggleProcreationBehavior = 'ToggleProcreationBehavior',
  TogglePlantingBehavior = 'TogglePlantingBehavior',
  ToggleGatheringBehavior = 'ToggleGatheringBehavior',
  ToggleAttackBehavior = 'ToggleAttackBehavior',
  ToggleCallToAttackBehavior = 'ToggleCallToAttackBehavior',
  ToggleFeedChildrenBehavior = 'ToggleFeedChildrenBehavior',
  FastForward = 'FastForward',
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
}
