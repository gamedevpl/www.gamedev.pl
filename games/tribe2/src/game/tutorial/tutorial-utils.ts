import { GameWorldState } from '../world-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  Tutorial,
  TutorialState,
  TutorialStep,
  TutorialStepKey,
  TransitionState,
  TutorialUIHighlightKey,
  ConditionType,
  Condition,
  GetTargets,
  GetTargetsType,
} from './tutorial-types';
import { HUMAN_HUNGER_THRESHOLD_TUTORIAL, HUMAN_INTERACTION_RANGE } from '../human-consts.ts';
import { UI_TUTORIAL_TRANSITION_DURATION_SECONDS, UI_TUTORIAL_MIN_DISPLAY_TIME_SECONDS } from '../ui/ui-consts.ts';
import { findClosestEntity, findPlayerEntity, findChildren, getAvailablePlayerActions, canProcreate } from '../utils';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { PlayerActionType } from '../ui/ui-types';
import { calculateWrappedDistance } from '../utils/math-utils';

const conditionTypes: Record<ConditionType, Condition> = {};

const getTargetTypes: Record<GetTargetsType, GetTargets> = {};

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    key: TutorialStepKey.MOVE,
    title: 'Movement',
    text: 'Use WASD or Arrow Keys to move your character around the world.',
    condition: (world: GameWorldState) => world.hasPlayerMovedEver || world.hasPlayerEnabledAutopilot > 2,
    isCompleted: false,
  },
  {
    key: TutorialStepKey.HUNGER,
    title: 'Hunger',
    text: 'Your character gets hungry over time. Watch the hunger bar!',
    condition: (_world: GameWorldState, player: HumanEntity) => player.hunger > HUMAN_HUNGER_THRESHOLD_TUTORIAL,
    isCompleted: false,
    minDisplayTime: UI_TUTORIAL_MIN_DISPLAY_TIME_SECONDS,
    highlightedUIElements: [TutorialUIHighlightKey.HUNGER_BAR],
  },
  {
    key: TutorialStepKey.FIND_BUSH,
    title: 'Find Food',
    text: 'Look for berry bushes. They are your primary source of food.',
    condition: (world: GameWorldState, player: HumanEntity) => {
      const closestBush = findClosestEntity<BerryBushEntity>(
        player,
        world,
        'berryBush',
        HUMAN_INTERACTION_RANGE * 5,
        (b) => b.food.length > 0,
      );
      return !!closestBush;
    },
    getTargets: (world: GameWorldState, player: HumanEntity) => {
      const visibleBushes: BerryBushEntity[] = [];
      for (const entity of Object.values(world.entities.entities)) {
        if (
          entity.type === 'berryBush' &&
          (entity as BerryBushEntity).food.length > 0 &&
          calculateWrappedDistance(
            player.position,
            entity.position,
            world.mapDimensions.width,
            world.mapDimensions.height,
          ) < 500 // Approx viewport
        ) {
          visibleBushes.push(entity as BerryBushEntity);
        }
      }
      return visibleBushes.map((b) => b.id);
    },
    isCompleted: false,
    minDisplayTime: UI_TUTORIAL_MIN_DISPLAY_TIME_SECONDS,
  },
  {
    key: TutorialStepKey.GATHER,
    title: 'Gather Berries',
    text: "Get close to a bush and press 'E' to gather berries.",
    condition: (_world: GameWorldState, player: HumanEntity) => player.food.length > 0,
    getTargets: (world: GameWorldState, player: HumanEntity) => {
      const closestBush = findClosestEntity<BerryBushEntity>(
        player,
        world,
        'berryBush',
        HUMAN_INTERACTION_RANGE,
        (b) => b.food.length > 0,
      );
      return closestBush ? [closestBush.id] : [];
    },
    isCompleted: false,
  },
  {
    key: TutorialStepKey.EAT,
    title: 'Eat',
    text: "When you are hungry and have food, press 'F' to eat.",
    condition: (_world: GameWorldState, player: HumanEntity) => player.activeAction === 'eating',
    isCompleted: false,
    highlightedUIElements: [TutorialUIHighlightKey.FOOD_BAR],
  },
  {
    key: TutorialStepKey.PROCREATE,
    title: 'Procreate',
    text: "Find a mate and press 'R' to start a family. This is how you continue your lineage.",
    condition: (world: GameWorldState, player: HumanEntity) => findChildren(world, player).length > 0,
    getTargets: (world: GameWorldState, player: HumanEntity) => {
      const potentialPartner = findClosestEntity<HumanEntity>(player, world, 'human', HUMAN_INTERACTION_RANGE, (h) =>
        canProcreate(player, h as HumanEntity, world),
      );
      return potentialPartner ? [potentialPartner.id] : [];
    },
    isCompleted: false,
  },
  {
    key: TutorialStepKey.PLANT_BUSH,
    title: 'Farming',
    text: "You can plant new berry bushes. Carry some berries and press 'B' to plant.",
    condition: (world: GameWorldState, player: HumanEntity) => {
      const actions = getAvailablePlayerActions(world, player);
      return actions.some((a) => a.type === PlayerActionType.Plant) || world.hasPlayerPlantedBush === true;
    },
    isCompleted: false,
  },
  {
    key: TutorialStepKey.AUTOPILOT,
    title: 'Autopilot!',
    text: 'You can turn autopilot for specific actions, press Shift and click on the action button to enable it.',
    condition: (world: GameWorldState) => world.hasPlayerEnabledAutopilot > 2,
    highlightedUIElements: [TutorialUIHighlightKey.COMMAND_BUTTONS],
    isCompleted: false,
  },
  {
    key: TutorialStepKey.ANIMALS_INTRODUCTION,
    title: 'Wild Animals!',
    text: 'Your world now has wild animals! Prey provide meat when hunted, but beware of predators that may attack.',
    condition: (world: GameWorldState) => {
      // Show when there are animals in the world
      const hasAnimals = Object.values(world.entities.entities).some(
        (entity) => entity.type === 'prey' || entity.type === 'predator',
      );
      return hasAnimals;
    },
    isCompleted: false,
    dependsOn: TutorialStepKey.AUTOPILOT,
  },
  {
    key: TutorialStepKey.HUNT_PREY,
    title: 'Hunt for Meat',
    text: 'Click on prey animals to hunt them for meat. Hunting provides more food than gathering berries!',
    condition: (world: GameWorldState, player: HumanEntity) => {
      // Show when player is hungry and there are prey nearby
      const nearbyPrey = findClosestEntity(player, world, 'prey', 150);
      return player.hunger > 40 && !!nearbyPrey;
    },
    getTargets: (world: GameWorldState, player: HumanEntity) => {
      const prey = findClosestEntity(player, world, 'prey', 150);
      return prey ? [prey.id] : [];
    },
    isCompleted: false,
    dependsOn: TutorialStepKey.ANIMALS_INTRODUCTION,
  },
  {
    key: TutorialStepKey.DEFEND_FROM_PREDATORS,
    title: 'Predators',
    text: 'Predators may attack when hungry! Click on them to fight back. Fighting together with family is more effective.',
    condition: (world: GameWorldState, player: HumanEntity) => {
      // Show when there are predators nearby
      const nearbyPredator = findClosestEntity(player, world, 'predator', 120);
      return !!nearbyPredator;
    },
    getTargets: (world: GameWorldState, player: HumanEntity) => {
      const predator = findClosestEntity(player, world, 'predator', 120);
      return predator ? [predator.id] : [];
    },
    isCompleted: false,
    dependsOn: TutorialStepKey.HUNT_PREY,
  },
].map(
  (step) =>
    ({
      ...step,
      condition: step.condition ? makeConditionType(step.condition) : undefined,
      getTargets: step.getTargets ? makeGetTargetsType(step.getTargets) : undefined,
    } as TutorialStep),
);

export function createTutorial(): Tutorial {
  return {
    steps: TUTORIAL_STEPS.map((step) => ({ ...step, isCompleted: false })),
  };
}

export function createTutorialState(): TutorialState {
  return {
    currentStepIndex: 0,
    completedSteps: [],
    isActive: true,
    transitionState: TransitionState.FADING_IN,
    transitionAlpha: 0,
    highlightedEntityIds: [],
    stepStartTime: null,
    activeUIHighlights: [],
  };
}

function findNextTutorialStep(world: GameWorldState): number | null {
  for (let i = 0; i < world.tutorial.steps.length; i++) {
    const step = world.tutorial.steps[i];
    if (!step.isCompleted) {
      if (step.dependsOn) {
        if (world.tutorialState.completedSteps.includes(step.dependsOn)) {
          return i;
        }
      } else {
        return i;
      }
    }
  }
  return null;
}

export function updateTutorial(world: GameWorldState, deltaTime: number): void {
  const state = world.tutorialState;

  if (!state.isActive) {
    state.transitionState = TransitionState.INACTIVE;
    state.highlightedEntityIds = [];
    state.activeUIHighlights = [];
    return;
  }

  const player = findPlayerEntity(world);
  if (!player) {
    state.isActive = false;
    state.transitionState = TransitionState.INACTIVE;
    state.highlightedEntityIds = [];
    state.activeUIHighlights = [];
    return;
  }

  const currentStep = world.tutorial.steps[state.currentStepIndex];
  if (!currentStep) {
    state.isActive = false;
    state.transitionState = TransitionState.INACTIVE;
    state.highlightedEntityIds = [];
    state.activeUIHighlights = [];
    return;
  }

  const transitionSpeed = 1 / UI_TUTORIAL_TRANSITION_DURATION_SECONDS;

  switch (state.transitionState) {
    case TransitionState.FADING_IN:
      if (state.stepStartTime === null) {
        state.stepStartTime = world.time;
      }
      state.transitionAlpha += transitionSpeed * deltaTime;
      if (state.transitionAlpha >= 1) {
        state.transitionAlpha = 1;
        state.transitionState = TransitionState.ACTIVE;
      }
      break;

    case TransitionState.ACTIVE: {
      const timeElapsed = world.time - (state.stepStartTime || world.time);
      const minTimePassed = timeElapsed >= (currentStep.minDisplayTime || 0);

      const condition = conditionTypes[currentStep.condition];
      if (condition && minTimePassed && condition(world, player)) {
        currentStep.isCompleted = true;
        if (!state.completedSteps.includes(currentStep.key)) {
          state.completedSteps.push(currentStep.key);
        }
        state.transitionState = TransitionState.FADING_OUT;
      }
      break;
    }

    case TransitionState.FADING_OUT:
      state.transitionAlpha -= transitionSpeed * deltaTime;
      if (state.transitionAlpha <= 0) {
        state.transitionAlpha = 0;
        state.stepStartTime = null; // Reset for the next step

        const nextStepIndex = findNextTutorialStep(world);

        if (nextStepIndex !== null) {
          state.currentStepIndex = nextStepIndex;
          state.transitionState = TransitionState.FADING_IN;
        } else {
          state.isActive = false;
          state.transitionState = TransitionState.INACTIVE;
        }
      }
      break;
  }

  // Manage highlights based on the current step and state
  const shouldHighlightsBeActive =
    state.transitionState !== TransitionState.FADING_OUT && state.transitionState !== TransitionState.INACTIVE;

  if (shouldHighlightsBeActive) {
    // Handle entity highlighting
    const getTargets = getTargetTypes[currentStep.getTargets || ''];
    if (getTargets) {
      state.highlightedEntityIds = [...getTargets(world, player)];
    } else {
      state.highlightedEntityIds = [];
    }

    // Handle UI element highlighting
    if (currentStep.highlightedUIElements) {
      state.activeUIHighlights = [...currentStep.highlightedUIElements];
    } else {
      state.activeUIHighlights = [];
    }
  } else {
    // Clear all highlights when fading out or inactive
    state.highlightedEntityIds = [];
    state.activeUIHighlights = [];
  }
}

function makeConditionType(condition: Condition): ConditionType {
  const key = `condition_${Object.keys(conditionTypes).length + 1}`;
  conditionTypes[key] = condition;
  return key;
}

function makeGetTargetsType(getTargets: GetTargets): GetTargetsType {
  const key = `getTargets_${Object.keys(getTargetTypes).length + 1}`;
  getTargetTypes[key] = getTargets;
  return key;
}
