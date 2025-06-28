import { Entity } from '../entities/entities-types';

export enum PlayerActionType {
  GatherFood = 'GatherFood',
  Eat = 'Eat',
  Procreate = 'Procreate',
  Attack = 'Attack',
  PlantBush = 'PlantBush',
}

export const PLAYER_ACTION_EMOJIS: Record<PlayerActionType, string> = {
  [PlayerActionType.GatherFood]: '✋',
  [PlayerActionType.Eat]: '🍖',
  [PlayerActionType.Procreate]: '❤️',
  [PlayerActionType.Attack]: '⚔️',
  [PlayerActionType.PlantBush]: '🌱',
};

export interface PlayerActionHint {
  type: PlayerActionType;
  key: string;
  targetEntity?: Entity;
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
}

export const UI_STATUS_EMOJIS: Record<UIStatusType, string> = {
  [UIStatusType.Time]: '🗓️',
  [UIStatusType.Hunger]: '🍖',
  [UIStatusType.Hitpoints]: '❤️',
  [UIStatusType.Food]: '🍓',
  [UIStatusType.Autopilot]: '🤖',
  [UIStatusType.Muted]: '🔇',
  [UIStatusType.Family]: '👨‍👩‍👧‍👦',
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
