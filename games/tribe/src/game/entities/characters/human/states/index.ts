import { State } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HumanStateData, HUMAN_IDLE, HUMAN_MOVING, HUMAN_EATING, HUMAN_HUNGRY, HUMAN_DYING } from './human-state-types';

// Define the human idle state
const humanIdleState: State<HumanEntity, HumanStateData> = {
  id: HUMAN_IDLE,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Check for hunger increase
    entity.hunger +=
      updateContext.deltaTime * (HUMAN_HUNGER_INCREASE_PER_HOUR / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

    // Check for age increase
    entity.age += updateContext.deltaTime * (1 / ((HOURS_PER_GAME_DAY * 365) / GAME_DAY_IN_REAL_SECONDS));

    // Check for death conditions
    if (entity.hunger >= HUMAN_HUNGER_DEATH) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
          cause: 'hunger',
        },
      };
    }

    if (entity.age >= HUMAN_MAX_AGE_YEARS) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
          cause: 'oldAge',
        },
      };
    }

    // Check for hunger threshold
    if (entity.hunger >= HUMAN_HUNGER_THRESHOLD_SLOW) {
      return {
        nextState: HUMAN_HUNGRY,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_IDLE,
        },
      };
    }

    return { nextState: HUMAN_IDLE, data };
  },
  onEnter: (context, nextData) => {
    // Reset acceleration and velocity when entering idle state
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};

// Define the human moving state
const humanMovingState: State<HumanEntity, HumanStateData> = {
  id: HUMAN_MOVING,
  update: (data, context) => {
    const { entity, updateContext } = context;
    const movingData = data as HumanMovingStateData;

    // Check for hunger increase
    entity.hunger +=
      updateContext.deltaTime * (HUMAN_HUNGER_INCREASE_PER_HOUR / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

    // Check for age increase
    entity.age += updateContext.deltaTime * (1 / ((HOURS_PER_GAME_DAY * 365) / GAME_DAY_IN_REAL_SECONDS));

    // Check for death conditions
    if (entity.hunger >= HUMAN_HUNGER_DEATH) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
          cause: 'hunger',
        },
      };
    }

    if (entity.age >= HUMAN_MAX_AGE_YEARS) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
          cause: 'oldAge',
        },
      };
    }

    // Check for hunger threshold
    if (entity.hunger >= HUMAN_HUNGER_THRESHOLD_SLOW) {
      return {
        nextState: HUMAN_HUNGRY,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
        },
      };
    }

    // Calculate direction to target
    const targetPosition = movingData.targetPosition;
    const direction = Math.atan2(targetPosition.y - entity.position.y, targetPosition.x - entity.position.x);

    // Update entity direction
    entity.targetDirection = direction;

    // Set acceleration based on base speed
    entity.acceleration = HUMAN_BASE_SPEED;

    // Check if we've reached the target
    const distance = calculateWrappedDistance(
      entity.position,
      targetPosition,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
    );

    if (distance < 5) {
      // Close enough to target
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_MOVING,
        },
      };
    }

    return { nextState: HUMAN_MOVING, data };
  },
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};

// Define the human eating state
const humanEatingState: State<HumanEntity, HumanStateData> = {
  id: HUMAN_EATING,
  update: (data, context) => {
    const { entity, updateContext } = context;
    const eatingData = data as HumanEatingStateData;

    // Check for hunger increase (slower while eating)
    entity.hunger +=
      updateContext.deltaTime *
      (HUMAN_HUNGER_INCREASE_PER_HOUR / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS)) *
      0.5;

    // Check for age increase
    entity.age += updateContext.deltaTime * (1 / ((HOURS_PER_GAME_DAY * 365) / GAME_DAY_IN_REAL_SECONDS));

    // Check for death conditions
    if (entity.hunger >= HUMAN_HUNGER_DEATH) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_EATING,
          cause: 'hunger',
        },
      };
    }

    if (entity.age >= HUMAN_MAX_AGE_YEARS) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_EATING,
          cause: 'oldAge',
        },
      };
    }

    // Get the berry bush
    const berryBush = updateContext.gameState.entities.entities.get(eatingData.berryBushId) as
      | BerryBushEntity
      | undefined;

    // If berry bush doesn't exist or has no berries, return to idle
    if (!berryBush || berryBush.currentBerries <= 0) {
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_EATING,
        },
      };
    }

    // Eat a berry (reduce hunger, decrement berry count)
    entity.hunger = Math.max(0, entity.hunger - HUMAN_BERRY_HUNGER_REDUCTION);
    berryBush.currentBerries--;

    // After eating, return to idle
    return {
      nextState: HUMAN_IDLE,
      data: {
        ...data,
        enteredAt: updateContext.gameState.time,
        previousState: HUMAN_EATING,
      },
    };
  },
  onEnter: (context, nextData) => {
    // Reset acceleration and velocity when entering eating state
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};

// Define the human hungry state
const humanHungryState: State<HumanEntity, HumanStateData> = {
  id: HUMAN_HUNGRY,
  update: (data, context) => {
    const { entity, updateContext } = context;

    // Check for hunger increase
    entity.hunger +=
      updateContext.deltaTime * (HUMAN_HUNGER_INCREASE_PER_HOUR / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

    // Check for age increase
    entity.age += updateContext.deltaTime * (1 / ((HOURS_PER_GAME_DAY * 365) / GAME_DAY_IN_REAL_SECONDS));

    // Check for death conditions
    if (entity.hunger >= HUMAN_HUNGER_DEATH) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_HUNGRY,
          cause: 'hunger',
        },
      };
    }

    if (entity.age >= HUMAN_MAX_AGE_YEARS) {
      return {
        nextState: HUMAN_DYING,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_HUNGRY,
          cause: 'oldAge',
        },
      };
    }

    // Check if hunger has dropped below threshold
    if (entity.hunger < HUMAN_HUNGER_THRESHOLD_SLOW) {
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: updateContext.gameState.time,
          previousState: HUMAN_HUNGRY,
        },
      };
    }

    // Apply slow debuff while in hungry state
    entity.debuffs = entity.debuffs.filter((debuff) => debuff.type !== 'slow');
    entity.debuffs.push({
      type: 'slow',
      startTime: updateContext.gameState.time,
      duration: 0.1, // Very short duration, will be reapplied each update
    });

    return { nextState: HUMAN_HUNGRY, data };
  },
  onEnter: (context, nextData) => {
    // Apply slow debuff when entering hungry state
    context.entity.debuffs.push({
      type: 'slow',
      startTime: context.updateContext.gameState.time,
      duration: 0.1, // Very short duration, will be reapplied each update
    });

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};

// Define the human dying state
const humanDyingState: State<HumanEntity, HumanDyingStateData> = {
  id: HUMAN_DYING,
  update: (data) => {
    // The entity is removed, so no meaningful state transition for it.
    // The entityUpdate loop might skip it in the next tick if removal is immediate.
    // For safety, we return the current state, but it should not be processed further.
    return { nextState: HUMAN_DYING, data };
  },
  onEnter: (context, nextData) => {
    const dyingData = nextData;

    // Set game over if this is the player and there are no offspring
    if (context.entity.isPlayer) {
      context.updateContext.gameState.gameOver = true;
      context.updateContext.gameState.causeOfGameOver = dyingData.cause;
    }

    // Remove the entity
    removeEntity(context.updateContext.gameState.entities, context.entity.id);

    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};

// Export all human states
export const allHumanStates = [humanIdleState, humanMovingState, humanEatingState, humanHungryState, humanDyingState];

// Import necessary types and constants
import {
  HUMAN_HUNGER_INCREASE_PER_HOUR,
  HUMAN_MAX_AGE_YEARS,
  HUMAN_HUNGER_DEATH,
  HUMAN_HUNGER_THRESHOLD_SLOW,
  HUMAN_BERRY_HUNGER_REDUCTION,
  HUMAN_BASE_SPEED,
  HOURS_PER_GAME_DAY,
  GAME_DAY_IN_REAL_SECONDS,
} from '../../../../../game/world-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { removeEntity } from '../../../entities-update';
import { HumanMovingStateData, HumanEatingStateData, HumanDyingStateData } from './human-state-types';
import { BerryBushEntity } from '../../../../entities/plants/berry-bush/berry-bush-types';
