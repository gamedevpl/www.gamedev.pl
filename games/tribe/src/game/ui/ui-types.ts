import { HumanAction } from '../entities/characters/human/human-types';
import { Entity, EntityId } from '../entities/entities-types';

export enum PlayerActionType {
  GatherFood = 'GatherFood',
  Eat = 'Eat',
  Procreate = 'Procreate',
  Attack = 'Attack',
  PlantBush = 'PlantBush',
  CallToAttack = 'CallToAttack',
}

export const PLAYER_ACTION_EMOJIS: Record<PlayerActionType, string> = {
  [PlayerActionType.GatherFood]: '✋',
  [PlayerActionType.Eat]: '🍖',
  [PlayerActionType.Procreate]: '❤️',
  [PlayerActionType.Attack]: '⚔️',
  [PlayerActionType.PlantBush]: '🌱',
  [PlayerActionType.CallToAttack]: '📢',
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
}

export interface ClickableUIButton {
  id: string;
  action: UIButtonActionType;
  rect: { x: number; y: number; width: number; height: number };
  text: string;
  backgroundColor: string;
  textColor: string;
}
