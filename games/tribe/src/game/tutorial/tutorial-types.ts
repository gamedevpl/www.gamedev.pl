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
    BECOME_LEADER = "BECOME_LEADER",
    FORM_TRIBE = "FORM_TRIBE",
    ATTACK = "ATTACK",
    CALL_TO_ATTACK = "CALL_TO_ATTACK",
    PLANT_BUSH = "PLANT_BUSH",
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
    getTarget?: (world: GameWorldState, player: HumanEntity) => EntityId | null;
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
    highlightedEntityId: EntityId | null;
}
