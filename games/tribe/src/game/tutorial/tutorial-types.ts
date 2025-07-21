import { GameWorldState } from "../world-types";
import { HumanEntity } from "../entities/characters/human/human-types";
import { EntityId } from "../entities/entities-types";

export enum TutorialStepKey {
    MOVE = "MOVE",
    HUNGER = "HUNGER",
    EAT = "EAT",
    FIND_BUSH = "FIND_BUSH",
    GATHER = "GATHER",
    PROCREATE = "PROCREATE",
    PLANT_BUSH = "PLANT_BUSH",
}

export enum TutorialUIHighlightKey {
    HUNGER_BAR = "HUNGER_BAR",
    FOOD_BAR = "FOOD_BAR",
}

export enum TransitionState {
    FADING_IN,
    ACTIVE,
    FADING_OUT,
    INACTIVE,
}

export interface TutorialStep {
    key: TutorialStepKey;
    title: string;
    text: string;
    condition: (world: GameWorldState, player: HumanEntity) => boolean;
    isCompleted: boolean;
    getTargets?: (world: GameWorldState, player: HumanEntity) => EntityId[];
    minDisplayTime?: number;
    dependsOn?: TutorialStepKey;
    highlightedUIElements?: TutorialUIHighlightKey[];
}

export interface Tutorial {
    steps: TutorialStep[];
}

export interface TutorialState {
    currentStepIndex: number;
    completedSteps: Set<TutorialStepKey>;
    isActive: boolean;
    transitionState: TransitionState;
    transitionAlpha: number; // 0 (transparent) to 1 (opaque)
    highlightedEntityIds: Set<EntityId>;
    stepStartTime: number | null;
    activeUIHighlights: Set<TutorialUIHighlightKey>;
}
