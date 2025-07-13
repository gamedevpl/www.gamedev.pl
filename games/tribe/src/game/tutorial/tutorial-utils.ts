import { GameWorldState } from '../world-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  Tutorial,
  TutorialState,
  TutorialStep,
  TutorialStepKey,
  TransitionState,
  TutorialUIHighlightKey,
} from './tutorial-types';
import {
  HUMAN_HUNGER_THRESHOLD_TUTORIAL,
  HUMAN_INTERACTION_RANGE,
  UI_TUTORIAL_TRANSITION_DURATION_SECONDS,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  UI_TUTORIAL_MIN_DISPLAY_TIME_SECONDS,
} from '../world-consts';
import { findClosestEntity, findPlayerEntity, findChildren, getAvailablePlayerActions } from '../utils/world-utils';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { PlayerActionType } from '../ui/ui-types';
import { calculateWrappedDistance } from '../utils/math-utils';

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    key: TutorialStepKey.MOVE,
    title: 'Movement',
    text: 'Use WASD or Arrow Keys to move your character around the world.',
    condition: (world: GameWorldState) => world.hasPlayerMovedEver,
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
      for (const entity of world.entities.entities.values()) {
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
      const potentialPartner = findClosestEntity<HumanEntity>(player, world, 'human', HUMAN_INTERACTION_RANGE, (h) => {
        const human = h as HumanEntity;
        return (
          (human.id !== player.id &&
            human.gender !== player.gender &&
            human.isAdult &&
            player.isAdult &&
            human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
            player.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
            (human.procreationCooldown || 0) <= 0 &&
            (player.procreationCooldown || 0) <= 0 &&
            (human.gender === 'female'
              ? !human.isPregnant && human.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE
              : !player.isPregnant)) ??
          false
        );
      });
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
      return actions.some((a) => a.type === PlayerActionType.PlantBush) && world.hasPlayerPlantedBush === true;
    },
    isCompleted: false,
  },
];

export function createTutorial(): Tutorial {
  return {
    steps: TUTORIAL_STEPS.map((step) => ({ ...step, isCompleted: false })),
  };
}

export function createTutorialState(): TutorialState {
  return {
    currentStepIndex: 0,
    completedSteps: new Set(),
    isActive: true,
    transitionState: TransitionState.FADING_IN,
    transitionAlpha: 0,
    highlightedEntityIds: new Set(),
    stepStartTime: null,
    activeUIHighlights: new Set(),
  };
}

function findNextTutorialStep(world: GameWorldState): number | null {
  for (let i = 0; i < world.tutorial.steps.length; i++) {
    const step = world.tutorial.steps[i];
    if (!step.isCompleted) {
      if (step.dependsOn) {
        if (world.tutorialState.completedSteps.has(step.dependsOn)) {
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
    state.highlightedEntityIds.clear();
    state.activeUIHighlights.clear();
    return;
  }

  const player = findPlayerEntity(world);
  if (!player) {
    state.isActive = false;
    state.transitionState = TransitionState.INACTIVE;
    state.highlightedEntityIds.clear();
    state.activeUIHighlights.clear();
    return;
  }

  const currentStep = world.tutorial.steps[state.currentStepIndex];
  if (!currentStep) {
    state.isActive = false;
    state.transitionState = TransitionState.INACTIVE;
    state.highlightedEntityIds.clear();
    state.activeUIHighlights.clear();
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

      if ((minTimePassed && currentStep.condition(world, player)) || world.isPlayerOnAutopilot) {
        currentStep.isCompleted = true;
        state.completedSteps.add(currentStep.key);
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
    if (currentStep.getTargets) {
      state.highlightedEntityIds = new Set(currentStep.getTargets(world, player));
    } else {
      state.highlightedEntityIds.clear();
    }

    // Handle UI element highlighting
    if (currentStep.highlightedUIElements) {
      state.activeUIHighlights = new Set(currentStep.highlightedUIElements);
    } else {
      state.activeUIHighlights.clear();
    }
  } else {
    // Clear all highlights when fading out or inactive
    state.highlightedEntityIds.clear();
    state.activeUIHighlights.clear();
  }
}
