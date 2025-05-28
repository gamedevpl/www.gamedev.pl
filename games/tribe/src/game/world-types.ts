/**
 * Defines the core data structures and type definitions for the Tribe game world state,
 * characters, and interactive elements like berry bushes.
 */

// Basic Types
export type Position = {
  x: number;
  y: number;
};

export type CharacterType = 'player' | 'partner' | 'child';
export type Gender = 'male' | 'female';
export type CauseOfDeath = 'hunger' | 'oldAge' | 'none';
export type NPCAction = 'idle' | 'seekingFood' | 'movingToBush' | 'collectingBerry' | 'eatingBerry';

// Entity Interfaces
export interface Character {
  id: string;
  type: CharacterType;
  gender: Gender;
  age: number; // Game years, float
  hunger: number; // 0-100
  position: Position;
  inventory: number; // Number of berries
  isAlive: boolean;
  procreationCooldownEndsAtGameTime: number; // Game hours, float
  gestationEndsAtGameTime?: number; // Game hours, float, for females
  motherId?: string;
  fatherId?: string;
  causeOfDeath: CauseOfDeath;
  currentAction?: NPCAction;
  targetBushId?: string;
  targetPosition?: Position;
  velocity: Position;
}

export interface BerryBush {
  id: string;
  position: Position;
  berriesAvailable: number;
  maxBerries: number;
  regenerationProgressHours: number; // float
}

// Game State Interface
export interface GameWorldState {
  time: number; // Total game hours passed since the start of the game, float
  characters: Character[];
  berryBushes: BerryBush[];
  generationCount: number;
  currentPlayerId: string | null;
  gameOver: boolean;
  causeOfGameOver?: string;
  mapDimensions: {
    width: number;
    height: number;
  };
}

// Game Constants

// Character Constants
export const PLAYER_INITIAL_AGE: number = 20; // years
export const PARTNER_INITIAL_AGE: number = 20; // years
export const INITIAL_HUNGER: number = 50; // 0-100
export const MAX_HUNGER: number = 100;
export const HUNGER_INCREASE_PER_HOUR: number = 0.5; // hunger points per game hour
export const HUNGER_MOVEMENT_THRESHOLD: number = 80; // Hunger level above which movement is slowed
export const HUNGER_PROCREATION_THRESHOLD: number = 95; // Hunger level above which procreation is not possible
export const MAX_AGE_YEARS: number = 60; // years
export const CHILD_TO_ADULT_AGE_YEARS: number = 5; // years
export const PLAYER_MAX_INVENTORY: number = 10; // berries

// NPC Behavior Constants
export const NPC_SEEK_FOOD_HUNGER_THRESHOLD: number = 60;
export const NPC_EAT_FOOD_HUNGER_THRESHOLD: number = 70;

// Procreation Constants
export const PROCREATION_COOLDOWN_DAYS: number = 1; // game days
export const GESTATION_DAYS: number = 3; // game days

// Resource Constants
export const BERRY_NUTRITION: number = 25; // hunger points restored by 1 berry
export const BERRY_BUSH_MAX_BERRIES: number = 5;
export const BERRY_BUSH_INITIAL_BERRIES: number = 3;
export const BERRY_REGEN_PER_DAY: number = 1; // berries regenerated per bush per day

// Time Constants
export const HOURS_PER_GAME_DAY: number = 24;
export const GAME_DAY_IN_REAL_SECONDS: number = 10;

// World and Movement Constants
export const MAP_WIDTH: number = 800; // pixels
export const MAP_HEIGHT: number = 600; // pixels
export const INTERACTION_RANGE: number = 30; // pixels
export const BASE_SPEED_PIXELS_PER_SECOND: number = 100;
export const HUNGER_SPEED_MULTIPLIER: number = 0.5; // 50% speed when very hungry
