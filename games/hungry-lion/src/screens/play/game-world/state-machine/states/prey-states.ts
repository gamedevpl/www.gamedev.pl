import { LionEntity, PreyEntity } from '../../entities/entities-types';
import { BaseStateData, State, StateContext } from '../state-machine-types';
import { getLions } from '../../game-world-query';
import { vectorSubtract, vectorNormalize, vectorDistance, vectorAngleBetween } from '../../utils/math-utils';
import { findClosestSector, getSectorAtEntity } from '../../environment/environment-query';

// Constants from existing behaviors
const IDLE_CHANCE = 0.5;
const MAX_SPEED_VARIATION = 0.005;
const FLEE_ACCELERATION = 0.011;
const FLEE_DISTANCE = 300;
const FLEE_ANGLE_THRESHOLD = Math.PI / 3;

// Prey state types
export type PreyStateType = 'PREY_IDLE' | 'PREY_MOVING' | 'PREY_FLEEING' | 'PREY_EATING' | 'PREY_DRINKING';

// Base prey state data
interface PreyStateData extends BaseStateData {
  lastDirectionChange?: number;
}

// State Definitions
export const PREY_IDLE_STATE: State<PreyEntity, PreyStateData> = {
  id: 'PREY_IDLE',
  update: (data, context) => {
    const { entity } = context;

    // Check for fleeing condition
    if (shouldFlee(entity, context)) {
      return { nextState: 'PREY_FLEEING', data: { enteredAt: context.updateContext.gameState.time } };
    }

    // Check for critical needs
    if (entity.thirstLevel < 30) {
      return { nextState: 'PREY_DRINKING', data: { enteredAt: context.updateContext.gameState.time } };
    }

    if (entity.hungerLevel < 30 && entity.thirstLevel >= 30) {
      return { nextState: 'PREY_EATING', data: { enteredAt: context.updateContext.gameState.time } };
    }

    // Randomly transition to moving state
    if (Math.random() > IDLE_CHANCE && context.updateContext.gameState.time - data.enteredAt > 5000) {
      entity.targetDirection = Math.random() * Math.PI * 2;
      return { nextState: 'PREY_MOVING', data: { enteredAt: context.updateContext.gameState.time } };
    }

    entity.acceleration = 0;
    return { nextState: 'PREY_IDLE', data };
  },
};

export const PREY_MOVING_STATE: State<PreyEntity, PreyStateData> = {
  id: 'PREY_MOVING',
  update: (data, context) => {
    const { entity } = context;

    // Check for fleeing condition
    if (shouldFlee(entity, context)) {
      return { nextState: 'PREY_FLEEING', data: { enteredAt: context.updateContext.gameState.time } };
    }

    // Check for critical needs
    if (entity.thirstLevel < 30) {
      return { nextState: 'PREY_DRINKING', data: { enteredAt: context.updateContext.gameState.time } };
    }

    if (entity.hungerLevel < 30 && entity.thirstLevel >= 30) {
      return { nextState: 'PREY_EATING', data: { enteredAt: context.updateContext.gameState.time } };
    }

    const now = context.updateContext.gameState.time;

    if (now - data.enteredAt > 5000) {
      return { nextState: 'PREY_IDLE', data: { enteredAt: context.updateContext.gameState.time } };
    }

    // Update movement
    if (!data.lastDirectionChange || now - data.lastDirectionChange > 100) {
      const angleChange = ((Math.random() - 0.5) * Math.PI) / 2;
      entity.targetDirection += angleChange / 10;
      data.lastDirectionChange = now;
    }

    entity.acceleration = 0.005 * (1 + (Math.random() - 0.5) * MAX_SPEED_VARIATION);

    return { nextState: 'PREY_MOVING', data };
  },
};

export const PREY_FLEEING_STATE: State<PreyEntity, PreyStateData> = {
  id: 'PREY_FLEEING',
  update: (data, context) => {
    const { entity } = context;

    if (!shouldFlee(entity, context) && context.updateContext.gameState.time - data.enteredAt > 5000) {
      return { nextState: 'PREY_IDLE', data: { enteredAt: context.updateContext.gameState.time } };
    }

    updateFleeing(entity, context);
    return { nextState: 'PREY_FLEEING', data };
  },
};

export const PREY_EATING_STATE: State<PreyEntity, PreyStateData> = {
  id: 'PREY_EATING',
  update: (data, context) => {
    const { entity, updateContext } = context;

    if (shouldFlee(entity, context)) {
      return { nextState: 'PREY_FLEEING', data: { enteredAt: context.updateContext.gameState.time } };
    }

    if (entity.hungerLevel >= 90) {
      return { nextState: 'PREY_IDLE', data: { enteredAt: context.updateContext.gameState.time } };
    }

    const sector = getSectorAtEntity(updateContext.gameState.environment, entity, 'grass');
    if (!sector) {
      const [closestSector] = findClosestSector(updateContext.gameState.environment, entity, 'grass');
      if (closestSector) {
        const targetX = closestSector.rect.x + closestSector.rect.width / 2;
        const targetY = closestSector.rect.y + closestSector.rect.height / 2;
        entity.targetDirection = Math.atan2(targetY - entity.position.y, targetX - entity.position.x);
        entity.acceleration = 0.005 * (1 + (Math.random() - 0.5) * MAX_SPEED_VARIATION);
      } else {
        return { nextState: 'PREY_IDLE', data: { enteredAt: context.updateContext.gameState.time } };
      }
    } else {
      entity.acceleration = 0;
    }

    return { nextState: 'PREY_EATING', data };
  },
};

export const PREY_DRINKING_STATE: State<PreyEntity, PreyStateData> = {
  id: 'PREY_DRINKING',
  update: (data, context) => {
    const { entity, updateContext } = context;

    if (shouldFlee(entity, context)) {
      return { nextState: 'PREY_FLEEING', data: { enteredAt: context.updateContext.gameState.time } };
    }

    if (entity.thirstLevel >= 90) {
      return { nextState: 'PREY_IDLE', data: { enteredAt: context.updateContext.gameState.time } };
    }

    const sector = getSectorAtEntity(updateContext.gameState.environment, entity, 'water');
    if (!sector) {
      const [closestSector] = findClosestSector(updateContext.gameState.environment, entity, 'water');
      if (closestSector) {
        const targetX = closestSector.rect.x + closestSector.rect.width / 2;
        const targetY = closestSector.rect.y + closestSector.rect.height / 2;
        entity.targetDirection = Math.atan2(targetY - entity.position.y, targetX - entity.position.x);
        entity.acceleration = 0.005 * (1 + (Math.random() - 0.5) * MAX_SPEED_VARIATION);
      } else {
        return { nextState: 'PREY_IDLE', data: { enteredAt: context.updateContext.gameState.time } };
      }
    } else {
      entity.acceleration = 0;
    }

    return { nextState: 'PREY_DRINKING', data };
  },
};

// Export all prey states
export const PREY_STATES = [
  PREY_IDLE_STATE,
  PREY_MOVING_STATE,
  PREY_FLEEING_STATE,
  PREY_EATING_STATE,
  PREY_DRINKING_STATE,
];

// Initial state creator
export function createPreyStateMachine(): [PreyStateType, PreyStateData] {
  return ['PREY_IDLE', { enteredAt: 0 }];
}

// Helper function to check if prey needs to flee
function shouldFlee(entity: PreyEntity, context: StateContext<PreyEntity>): boolean {
  const lions = getLions(context.updateContext.gameState);
  let nearestLion = null;
  let minDistance = Infinity;

  for (const lion of lions) {
    const distance = vectorDistance(entity.position, lion.position);
    if (distance < minDistance) {
      minDistance = distance;
      nearestLion = lion;
    }
  }

  if (nearestLion) {
    const directionVector = vectorSubtract(entity.position, nearestLion.position);
    const normalizedDirection = vectorNormalize(directionVector);
    const preyDirectionVector = { x: Math.cos(entity.direction), y: Math.sin(entity.direction) };
    const angle = vectorAngleBetween(preyDirectionVector, normalizedDirection);

    const adjustedFleeDistance = angle < FLEE_ANGLE_THRESHOLD ? FLEE_DISTANCE * 0.5 : FLEE_DISTANCE;
    return minDistance < adjustedFleeDistance;
  }

  return false;
}

// Helper function to update fleeing behavior
function updateFleeing(entity: PreyEntity, context: StateContext<PreyEntity>): void {
  const lions = getLions(context.updateContext.gameState);
  const nearestLion = lions.reduce<LionEntity | null>((nearest, lion) => {
    const distance = vectorDistance(entity.position, lion.position);
    return !nearest || distance < vectorDistance(entity.position, nearest.position) ? lion : nearest;
  }, null);

  if (nearestLion) {
    const directionVector = vectorSubtract(entity.position, nearestLion.position);
    const normalizedDirection = vectorNormalize(directionVector);
    entity.targetDirection = Math.atan2(normalizedDirection.y, normalizedDirection.x);
    entity.acceleration = FLEE_ACCELERATION - (FLEE_ACCELERATION * (1 - entity.staminaLevel / 100)) / 2;
  }
}
