import { Entity } from '../entities/entities-types';

export enum PlayerActionType {
  Gather = 'Gather',
  Eat = 'Eat',
  Procreate = 'Procreate',
  Attack = 'Attack',
}

export const PLAYER_ACTION_EMOJIS: Record<PlayerActionType, string> = {
  [PlayerActionType.Gather]: '✋',
  [PlayerActionType.Eat]: '🍖',
  [PlayerActionType.Procreate]: '❤️',
  [PlayerActionType.Attack]: '⚔️',
};

export interface PlayerActionHint {
  type: PlayerActionType;
  key: string;
  targetEntity?: Entity;
}
