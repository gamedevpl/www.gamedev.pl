import { HumanEntity } from '../characters/human/human-types';
import { GameWorldState } from '../../world-types';
import { Blackboard } from '../../ai/behavior-tree/behavior-tree-blackboard';
import { EntityId } from '../entities-types';
import { Vector2D } from '../../utils/math-types';

/**
 * Task timeout in game hours - after this time, a task is considered abandoned
 */
export const TRIBAL_TASK_TIMEOUT_HOURS = 24;

/**
 * Maximum number of tribe members that can work on the same prey hunt
 */
export const MAX_HUNTERS_PER_PREY = 2;

/**
 * Maximum number of tribe members that can use the same storage spot simultaneously
 */
export const MAX_USERS_PER_STORAGE = 2;

/**
 * Generic task data structure stored in the blackboard
 */
export type TribalTaskData = {
  memberIds: EntityId[];
  startTime: number;
  maxCapacity: number;
  position?: Vector2D;
  action?: 'deposit' | 'retrieve';
};

/**
 * Gets the tribe leader (or family head) whose blackboard should be used for coordination
 */
export function getTribeLeaderForCoordination(human: HumanEntity, gameState: GameWorldState): HumanEntity | null {
  // If human is in a tribe, use the tribe leader
  if (human.leaderId) {
    const leader = gameState.entities.entities[human.leaderId] as HumanEntity | undefined;
    if (leader && leader.aiBlackboard) {
      return leader;
    }
  }

  // If human is an adult with a family, use themselves as the coordination point
  if (human.isAdult && human.aiBlackboard) {
    return human;
  }

  // If human is a child, try to use their father as coordination point
  if (!human.isAdult && human.fatherId) {
    const father = gameState.entities.entities[human.fatherId] as HumanEntity | undefined;
    if (father && father.aiBlackboard) {
      return father;
    }
  }

  return null;
}

/**
 * Cleans up all stale tribal tasks for a leader
 */
export function cleanupStaleTribalTasks(leader: HumanEntity, currentTime: number): void {
  if (!leader.aiBlackboard) return;

  const data = leader.aiBlackboard.data;
  const keysToDelete: string[] = [];

  for (const key in data) {
    if (key.startsWith('tribal_')) {
      const task = data[key] as TribalTaskData;

      if (task && typeof task === 'object' && 'startTime' in task) {
        if (currentTime - task.startTime > TRIBAL_TASK_TIMEOUT_HOURS) {
          keysToDelete.push(key);
        }
      }
    }
  }

  for (const key of keysToDelete) {
    Blackboard.delete(leader.aiBlackboard, key);
  }
}

/**
 * Removes all tasks assigned to a specific member (useful when member dies)
 */
export function removeAllTasksForMember(leader: HumanEntity, memberId: EntityId): void {
  if (!leader.aiBlackboard) return;

  const data = leader.aiBlackboard.data;
  const keysToDelete: string[] = [];

  for (const key in data) {
    if (key.startsWith('tribal_')) {
      const task = data[key] as TribalTaskData;

      if (task && typeof task === 'object' && Array.isArray(task.memberIds)) {
        task.memberIds = task.memberIds.filter((id) => id !== memberId);

        if (task.memberIds.length === 0) {
          keysToDelete.push(key);
        } else {
          Blackboard.set(leader.aiBlackboard, key, task);
        }
      }
    }
  }

  for (const key of keysToDelete) {
    Blackboard.delete(leader.aiBlackboard, key);
  }
}

/**
 * Removes a specific task from the leader's blackboard.
 * This is a helper for manual cleanup if needed (e.g. from interactions).
 */
export function removeTribalStorageTask(leader: HumanEntity, storageId: EntityId, memberId: EntityId): void {
  if (!leader.aiBlackboard) return;

  const taskKey = `tribal_storage_${storageId}`;
  const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);

  if (!task) return;

  task.memberIds = task.memberIds.filter((id) => id !== memberId);

  if (task.memberIds.length === 0) {
    Blackboard.delete(leader.aiBlackboard, taskKey);
  } else {
    Blackboard.set(leader.aiBlackboard, taskKey, task);
  }
}
