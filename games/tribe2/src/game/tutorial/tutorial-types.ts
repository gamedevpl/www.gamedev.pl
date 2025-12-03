import { GameWorldState } from '../world-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { EntityId } from '../entities/entities-types';

export enum TutorialStepKey {
  MOVE = 'MOVE',
  HUNGER = 'HUNGER',
  EAT = 'EAT',
  FIND_BUSH = 'FIND_BUSH',
  GATHER = 'GATHER',
  PROCREATE = 'PROCREATE',
  PLANT_BUSH = 'PLANT_BUSH',
  AUTOPILOT = 'AUTOPILOT',
  ANIMALS_INTRODUCTION = 'ANIMALS_INTRODUCTION',
  HUNT_PREY = 'HUNT_PREY',
  DEFEND_FROM_PREDATORS = 'DEFEND_FROM_PREDATORS',
}

export enum TutorialUIHighlightKey {
  HUNGER_BAR = 'HUNGER_BAR',
  FOOD_BAR = 'FOOD_BAR',
  COMMAND_BUTTONS = 'COMMAND_BUTTONS',
}

export enum TransitionState {
  FADING_IN,
  ACTIVE,
  FADING_OUT,
  INACTIVE,
}

export type Condition = (world: GameWorldState, player: HumanEntity) => boolean;
export type ConditionType = string;

export type GetTargets = (world: GameWorldState, player: HumanEntity) => EntityId[];
export type GetTargetsType = string;

export interface TutorialStep {
  key: TutorialStepKey;
  title: string;
  text: string;
  condition: ConditionType;
  isCompleted: boolean;
  getTargets?: GetTargetsType;
  minDisplayTime?: number;
  dependsOn?: TutorialStepKey;
  highlightedUIElements?: TutorialUIHighlightKey[];
}

export interface Tutorial {
  steps: TutorialStep[];
}

export interface TutorialState {
  currentStepIndex: number;
  completedSteps: TutorialStepKey[];
  isActive: boolean;
  transitionState: TransitionState;
  transitionAlpha: number; // 0 (transparent) to 1 (opaque)
  highlightedEntityIds: EntityId[];
  stepStartTime: number | null;
  activeUIHighlights: TutorialUIHighlightKey[];
}
