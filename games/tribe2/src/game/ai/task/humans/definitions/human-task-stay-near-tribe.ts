import {
  HUMAN_MAX_DISTANCE_FROM_TRIBE_CENTER,
  HUMAN_STAY_NEAR_TRIBE_STRENGTH,
  HUMAN_STAY_NEAR_TRIBE_STOP_DISTANCE,
} from '../../../../ai-consts';
import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { calculateWrappedDistance, dirToTarget } from '../../../../utils/math-utils';
import { getTribeCenter } from '../../../../utils/spatial-utils';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskResult, TaskType } from '../../task-types';
import { defineHumanTask } from '../human-task-utils';

/**
 * Task that triggers when a human is too far from their tribe center.
 * It forces them to move back towards the center of the tribe.
 */
export const humanStayNearTribeDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanStayNearTribe,
  requireAdult: false,
  producer: (human, context) => {
    const { gameState } = context;
    const tasks: Record<string, Task> = {};

    if (!human.leaderId || human.id === human.leaderId) {
      return tasks;
    }

    const tribeCenter = getTribeCenter(human.leaderId, gameState);

    const taskId = `stay-near-tribe-${human.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.HumanStayNearTribe,
      position: human.position,
      creatorEntityId: human.id,
      target: tribeCenter,
      validUntilTime: gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
    };

    return tasks;
  },
  scorer: (human, _task, context) => {
    if (!human.leaderId || human.id === human.leaderId) return null;

    const tribeCenter = getTribeCenter(human.leaderId, context.gameState);
    const distance = calculateWrappedDistance(
      human.position,
      tribeCenter,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance <= HUMAN_MAX_DISTANCE_FROM_TRIBE_CENTER) {
      return null;
    }

    // Score increases as we get further away, pulling the entity back
    const excessDistance = distance - HUMAN_MAX_DISTANCE_FROM_TRIBE_CENTER;
    // Normalized score: 0.5 at threshold, approaching 1.0 as distance increases
    const score = Math.min(0.95, 0.5 + (excessDistance / 1000) * HUMAN_STAY_NEAR_TRIBE_STRENGTH);

    return score;
  },
  executor: (_task, human, context) => {
    if (!human.leaderId) return TaskResult.Failure;

    const tribeCenter = getTribeCenter(human.leaderId, context.gameState);
    const distance = calculateWrappedDistance(
      human.position,
      tribeCenter,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // If we are back in safe range (200px from center), succeed
    if (distance < HUMAN_STAY_NEAR_TRIBE_STOP_DISTANCE) {
      human.activeAction = 'idle';
      human.target = undefined;
      return TaskResult.Success;
    }

    human.activeAction = 'moving';
    human.target = tribeCenter;
    human.direction = dirToTarget(human.position, tribeCenter, context.gameState.mapDimensions);

    return [TaskResult.Running, `Returning to tribe center (${Math.round(distance)}px away)`];
  },
});
