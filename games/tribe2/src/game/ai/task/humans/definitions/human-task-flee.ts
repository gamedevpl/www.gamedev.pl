import { AI_FLEE_DISTANCE, AI_FLEE_HEALTH_THRESHOLD } from '../../../../ai-consts';
import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { findClosestAggressor } from '../../../../utils/entity-finder-utils';
import {
  calculateWrappedDistance,
  getDirectionVectorOnTorus,
  vectorAdd,
  vectorNormalize,
  vectorScale,
} from '../../../../utils/math-utils';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskResult, TaskType } from '../../task-types';
import { defineHumanTask } from '../human-task-utils';

export const humanFleeDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanFlee,
  requireAdult: false,
  producer: (human, context) => {
    const tasks: Record<string, Task> = {};

    if (human.hitpoints < human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD) {
      const threat = findClosestAggressor(human.id, context.gameState);
      if (threat) {
        const taskId = `flee-task-${human.id}`;
        tasks[taskId] = {
          id: taskId,
          type: TaskType.HumanFlee,
          position: human.position,
          creatorEntityId: human.id,
          target: threat.id,
          validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
        };
      }
    }

    return tasks;
  },
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') return null;

    const threat = context.gameState.entities.entities[task.target];
    if (!threat) {
      return null;
    }

    // Fleeing is high priority when injured
    if (human.hitpoints < human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD) {
      return 0.9;
    }

    return null;
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') return TaskResult.Failure;

    const threat = context.gameState.entities.entities[task.target];
    if (!threat) {
      human.activeAction = 'idle';
      human.attackTargetId = undefined;
      return TaskResult.Success;
    }

    const distance = calculateWrappedDistance(
      human.position,
      threat.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > AI_FLEE_DISTANCE) {
      human.activeAction = 'idle';
      human.target = undefined;
      return TaskResult.Success;
    }

    human.activeAction = 'moving';
    human.attackTargetId = undefined; // Stop attacking while fleeing

    // Flee directly away from the threat
    const fleeFromThreatVector = getDirectionVectorOnTorus(
      threat.position,
      human.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    const fleeDirection = vectorNormalize(fleeFromThreatVector);

    // Calculate a target position far away in the flee direction
    const targetPosition = vectorAdd(human.position, vectorScale(fleeDirection, AI_FLEE_DISTANCE));

    // Set the target position, wrapped around the world
    human.target = {
      x:
        ((targetPosition.x % context.gameState.mapDimensions.width) + context.gameState.mapDimensions.width) %
        context.gameState.mapDimensions.width,
      y:
        ((targetPosition.y % context.gameState.mapDimensions.height) + context.gameState.mapDimensions.height) %
        context.gameState.mapDimensions.height,
    };

    human.direction = fleeDirection;

    return TaskResult.Running;
  },
});
