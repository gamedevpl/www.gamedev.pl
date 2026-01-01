import {
  HUMAN_MAX_DISTANCE_FROM_PARENT,
  HUMAN_STAY_NEAR_PARENT_STRENGTH,
  HUMAN_STAY_NEAR_PARENT_STOP_DISTANCE,
} from '../../../../ai-consts';
import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { findFamilyPatriarch } from '../../../../entities/tribe/family-tribe-utils';
import { calculateWrappedDistance, dirToTarget } from '../../../../utils/math-utils';
import { getOwnerOfPoint, tribeHasTerritory } from '../../../../utils';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskResult, TaskType } from '../../task-types';
import { defineHumanTask } from '../human-task-utils';

/**
 * Task that triggers when a child is too far from their parent (patriarch/mother).
 * It ensures children stay close to their primary family figure.
 */
export const humanStayNearParentDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanStayNearParent,
  requireAdult: false,
  producer: (child, context) => {
    const { gameState } = context;
    const tasks: Record<string, Task> = {};

    // Only children use this specific leash
    if (child.isAdult) {
      return tasks;
    }

    const parent = findFamilyPatriarch(child, gameState);
    if (!parent) {
      return tasks;
    }

    const taskId = `stay-near-parent-${child.id}`;
    tasks[taskId] = {
      id: taskId,
      type: TaskType.HumanStayNearParent,
      position: child.position,
      creatorEntityId: child.id,
      target: parent.id,
      validUntilTime: gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
    };

    return tasks;
  },
  scorer: (child, task, context) => {
    if (child.isAdult) return null;

    const parent = findFamilyPatriarch(child, context.gameState);
    if (!parent || parent.id !== task.target) return null;

    // Children should not follow parent who is outside of tribe territory
    if (child.leaderId && tribeHasTerritory(child.leaderId, context.gameState)) {
      const parentOwner = getOwnerOfPoint(parent.position.x, parent.position.y, context.gameState);
      if (parentOwner !== child.leaderId) {
        return null;
      }
    }

    const distance = calculateWrappedDistance(
      child.position,
      parent.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance <= HUMAN_MAX_DISTANCE_FROM_PARENT) {
      return null;
    }

    // Score increases as child gets further away
    const excessDistance = distance - HUMAN_MAX_DISTANCE_FROM_PARENT;
    // Higher base priority than tribe leash (0.6 vs 0.5)
    const score = Math.min(0.98, 0.6 + (excessDistance / 500) * HUMAN_STAY_NEAR_PARENT_STRENGTH);

    return score;
  },
  executor: (task, child, context) => {
    if (typeof task.target !== 'number') {
      child.activeAction = 'idle';
      return TaskResult.Failure;
    }

    const parent = context.gameState.entities.entities[task.target] as HumanEntity | undefined;
    if (!parent || parent.type !== 'human') {
      child.activeAction = 'idle';
      child.target = undefined;
      return TaskResult.Failure;
    }

    const distance = calculateWrappedDistance(
      child.position,
      parent.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // If we are back in safe follow range, succeed
    if (distance <= HUMAN_STAY_NEAR_PARENT_STOP_DISTANCE) {
      child.activeAction = 'idle';
      child.target = undefined;
      return TaskResult.Success;
    }

    child.activeAction = 'moving';
    child.target = parent.id;
    child.direction = dirToTarget(child.position, parent.position, context.gameState.mapDimensions);

    return [TaskResult.Running, `Returning to parent (${Math.round(distance)}px away)`];
  },
});
