import { HumanAction } from '../entities/characters/human/human-types';
import { Entity, EntityId } from '../entities/entities-types';

export enum PlayerActionType {
  Gather = 'Gather',
  Eat = 'Eat',
  Procreate = 'Procreate',
  Attack = 'Attack',
  Plant = 'Plant',
  CallToAttack = 'CallToAttack',
  TribeSplit = 'TribeSplit',
  FollowMe = 'FollowMe',
  FeedChildren = 'FeedChildren',
  // Autopilot specific
  AutopilotMove = 'AutopilotMove',
  AutopilotGather = 'AutopilotGather',
  AutopilotAttack = 'AutopilotAttack',
  AutopilotProcreate = 'AutopilotProcreate',
  AutopilotPlant = 'AutopilotPlant',
  AutopilotFeedChildren = 'AutopilotFeedChildren',
  AutopilotFollowMe = 'AutopilotFollowMe',
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
  [PlayerActionType.FeedChildren]: '👨‍👧',
  [PlayerActionType.AutopilotMove]: '🎯',
  [PlayerActionType.AutopilotGather]: '✋',
  [PlayerActionType.AutopilotAttack]: '⚔️',
  [PlayerActionType.AutopilotProcreate]: '❤️',
  [PlayerActionType.AutopilotPlant]: '🌱',
  [PlayerActionType.AutopilotFeedChildren]: '👨‍👧',
  [PlayerActionType.AutopilotFollowMe]: '➡️',
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
  [PlayerActionType.FeedChildren]: 'Feed Children',
  [PlayerActionType.AutopilotMove]: 'Walk',
  [PlayerActionType.AutopilotGather]: 'Gather',
  [PlayerActionType.AutopilotAttack]: 'Attack',
  [PlayerActionType.AutopilotProcreate]: 'Procreate',
  [PlayerActionType.AutopilotPlant]: 'Plant',
  [PlayerActionType.AutopilotFeedChildren]: 'Feed',
  [PlayerActionType.AutopilotFollowMe]: 'Follow',
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
  // System Controls
  ToggleMute = 'ToggleMute',
  TogglePause = 'TogglePause',
  FastForward = 'FastForward',

  // --- Player Commands (One-Time Actions) ---
  CommandEat = 'CommandEat',
  CommandPlant = 'CommandPlant',
  CommandCallToAttack = 'CommandCallToAttack',
  CommandFollowMe = 'CommandFollowMe',
  CommandGather = 'CommandGather',
  CommandTribeSplit = 'CommandTribeSplit',

  // --- Autopilot Behavior Toggles ---
  // These are behaviors that can be toggled on/off for the AI
  ToggleProcreationBehavior = 'ToggleProcreationBehavior',
  ToggleAttackBehavior = 'ToggleAttackBehavior',
  ToggleFeedChildrenBehavior = 'ToggleFeedChildrenBehavior',
  TogglePlantingBehavior = 'TogglePlantingBehavior',
  ToggleGatheringBehavior = 'ToggleGatheringBehavior',
  ToggleAutopilotFollowLeaderBehavior = 'ToggleAutopilotFollowLeaderBehavior',
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
}
