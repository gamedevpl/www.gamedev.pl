import { HumanEntity } from '../entities/characters/human/human-types';
import { GameWorldState } from '../world-types';
import { Blackboard } from '../ai/behavior-tree/behavior-tree-blackboard';
import { EntityId } from '../entities/entities-types';
import { Vector2D } from './math-types';

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
 * Task data structures
 */
export type TribalGatherTask = {
  memberId: EntityId;
  startTime: number;
};

export type TribalHuntTask = {
  memberIds: EntityId[];
  startTime: number;
  maxAssignments: number;
};

export type TribalPlantTask = {
  memberId: EntityId;
  startTime: number;
};

export type TribalAttackTask = {
  memberIds: EntityId[];
  startTime: number;
  maxAssignments: number;
};

export type TribalStorageTask = {
  users: { memberId: EntityId; action: 'deposit' | 'retrieve'; startTime: number }[];
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
 * Registers a gathering task for a specific bush
 */
export function registerTribalGatherTask(
  leader: HumanEntity,
  sourceId: EntityId,
  memberId: EntityId,
  currentTime: number,
): void {
  if (!leader.aiBlackboard) return;

  const taskKey = `tribal_gather_${sourceId}`;
  const taskData: TribalGatherTask = {
    memberId,
    startTime: currentTime,
  };

  Blackboard.set(leader.aiBlackboard, taskKey, taskData);
}

/**
 * Checks if a gathering task is already assigned for a specific bush
 */
export function isTribalGatherTaskAssigned(
  leader: HumanEntity | null,
  sourceId: EntityId,
  currentTime: number,
): boolean {
  if (!leader?.aiBlackboard) return false;

  const taskKey = `tribal_gather_${sourceId}`;
  const task = Blackboard.get<TribalGatherTask>(leader.aiBlackboard, taskKey);

  if (!task) return false;

  // Check if task is stale
  if (currentTime - task.startTime > TRIBAL_TASK_TIMEOUT_HOURS) {
    Blackboard.delete(leader.aiBlackboard, taskKey);
    return false;
  }

  return true;
}

/**
 * Gets the member assigned to a gathering task
 */
export function getTribalGatherTaskAssignee(leader: HumanEntity | null, sourceId: EntityId): EntityId | null {
  if (!leader?.aiBlackboard) return null;

  const taskKey = `tribal_gather_${sourceId}`;
  const task = Blackboard.get<TribalGatherTask>(leader.aiBlackboard, taskKey);

  return task?.memberId ?? null;
}

/**
 * Removes a gathering task
 */
export function removeTribalGatherTask(leader: HumanEntity, sourceId: EntityId): void {
  if (!leader.aiBlackboard) return;

  const taskKey = `tribal_gather_${sourceId}`;
  Blackboard.delete(leader.aiBlackboard, taskKey);
}

/**
 * Registers a hunt task for a specific prey
 */
export function registerTribalHuntTask(
  leader: HumanEntity,
  preyId: EntityId,
  memberId: EntityId,
  currentTime: number,
): boolean {
  if (!leader.aiBlackboard) return false;

  const taskKey = `tribal_hunt_${preyId}`;
  let task = Blackboard.get<TribalHuntTask>(leader.aiBlackboard, taskKey);

  if (!task) {
    // Create new hunt task
    task = {
      memberIds: [memberId],
      startTime: currentTime,
      maxAssignments: MAX_HUNTERS_PER_PREY,
    };
    Blackboard.set(leader.aiBlackboard, taskKey, task);
    return true;
  }

  // Check if task is stale
  if (currentTime - task.startTime > TRIBAL_TASK_TIMEOUT_HOURS) {
    // Reset stale task
    task = {
      memberIds: [memberId],
      startTime: currentTime,
      maxAssignments: MAX_HUNTERS_PER_PREY,
    };
    Blackboard.set(leader.aiBlackboard, taskKey, task);
    return true;
  }

  // Check if already at max capacity
  if (task.memberIds.length >= task.maxAssignments) {
    return false;
  }

  // Check if member is already assigned
  if (task.memberIds.includes(memberId)) {
    return true;
  }

  // Add member to hunt
  task.memberIds.push(memberId);
  Blackboard.set(leader.aiBlackboard, taskKey, task);
  return true;
}

/**
 * Checks if a hunt task has available slots
 */
export function canJoinTribalHuntTask(leader: HumanEntity | null, preyId: EntityId, currentTime: number): boolean {
  if (!leader?.aiBlackboard) return true; // No coordination, allow hunting

  const taskKey = `tribal_hunt_${preyId}`;
  const task = Blackboard.get<TribalHuntTask>(leader.aiBlackboard, taskKey);

  if (!task) return true; // No task exists, can start hunting

  // Check if task is stale
  if (currentTime - task.startTime > TRIBAL_TASK_TIMEOUT_HOURS) {
    return true;
  }

  if (task.memberIds.includes(leader.id)) {
    return task.memberIds.indexOf(leader.id) < task.maxAssignments;
  }

  // Check if at max capacity
  return task.memberIds.length < task.maxAssignments;
}

/**
 * Gets the number of hunters assigned to a prey
 */
export function getTribalHuntTaskCount(leader: HumanEntity | null, preyId: EntityId): number {
  if (!leader?.aiBlackboard) return 0;

  const taskKey = `tribal_hunt_${preyId}`;
  const task = Blackboard.get<TribalHuntTask>(leader.aiBlackboard, taskKey);

  return task?.memberIds.length ?? 0;
}

/**
 * Removes a member from a hunt task
 */
export function removeFromTribalHuntTask(leader: HumanEntity, preyId: EntityId, memberId: EntityId): void {
  if (!leader.aiBlackboard) return;

  const taskKey = `tribal_hunt_${preyId}`;
  const task = Blackboard.get<TribalHuntTask>(leader.aiBlackboard, taskKey);

  if (!task) return;

  task.memberIds = task.memberIds.filter((id) => id !== memberId);

  if (task.memberIds.length === 0) {
    // No hunters left, remove task
    Blackboard.delete(leader.aiBlackboard, taskKey);
  } else {
    Blackboard.set(leader.aiBlackboard, taskKey, task);
  }
}

/**
 * Removes a hunt task entirely
 */
export function removeTribalHuntTask(leader: HumanEntity, preyId: EntityId): void {
  if (!leader.aiBlackboard) return;

  const taskKey = `tribal_hunt_${preyId}`;
  Blackboard.delete(leader.aiBlackboard, taskKey);
}

/**
 * Registers a planting task for a specific position
 */
export function registerTribalPlantTask(
  leader: HumanEntity,
  position: Vector2D,
  memberId: EntityId,
  currentTime: number,
): void {
  if (!leader.aiBlackboard) return;

  const taskKey = `tribal_plant_${Math.round(position.x)}_${Math.round(position.y)}`;
  const taskData: TribalPlantTask = {
    memberId,
    startTime: currentTime,
  };

  Blackboard.set(leader.aiBlackboard, taskKey, taskData);
}

/**
 * Checks if a planting task is already assigned for a specific position
 */
export function isTribalPlantTaskAssigned(
  leader: HumanEntity | null,
  position: Vector2D,
  currentTime: number,
  proximityRadius: number = 50,
): boolean {
  if (!leader?.aiBlackboard) return false;

  // Check for tasks in the vicinity (not just exact position)
  const data = leader.aiBlackboard.data;
  for (const key in data) {
    if (key.startsWith('tribal_plant_')) {
      const task = data[key] as TribalPlantTask;

      // Parse position from key
      const parts = key.split('_');
      const taskX = parseInt(parts[2]);
      const taskY = parseInt(parts[3]);

      // Check proximity
      const dx = position.x - taskX;
      const dy = position.y - taskY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= proximityRadius) {
        // Check if task is stale
        if (currentTime - task.startTime > TRIBAL_TASK_TIMEOUT_HOURS) {
          Blackboard.delete(leader.aiBlackboard, key);
          continue;
        }
        return true;
      }
    }
  }

  return false;
}

/**
 * Removes a planting task
 */
export function removeTribalPlantTask(leader: HumanEntity, position: Vector2D): void {
  if (!leader.aiBlackboard) return;

  const taskKey = `tribal_plant_${Math.round(position.x)}_${Math.round(position.y)}`;
  Blackboard.delete(leader.aiBlackboard, taskKey);
}

/**
 * Registers a storage task for a specific storage spot
 */
export function registerTribalStorageTask(
  leader: HumanEntity,
  storageId: EntityId,
  memberId: EntityId,
  action: 'deposit' | 'retrieve',
  currentTime: number,
): boolean {
  if (!leader.aiBlackboard) return false;

  const taskKey = `tribal_storage_${storageId}`;
  let task = Blackboard.get<TribalStorageTask>(leader.aiBlackboard, taskKey);

  if (!task) {
    // Create new storage task
    task = {
      users: [{ memberId, action, startTime: currentTime }],
    };
    Blackboard.set(leader.aiBlackboard, taskKey, task);
    return true;
  }

  // Clean up stale users
  task.users = task.users.filter((user) => currentTime - user.startTime <= TRIBAL_TASK_TIMEOUT_HOURS);

  // Check if already at max capacity
  if (task.users.length >= MAX_USERS_PER_STORAGE) {
    // Check if this member is already registered
    const existingUser = task.users.find((user) => user.memberId === memberId);
    if (existingUser) {
      // Refresh the timestamp
      existingUser.startTime = currentTime;
      existingUser.action = action;
      Blackboard.set(leader.aiBlackboard, taskKey, task);
      return true;
    }
    return false;
  }

  // Check if member is already in the list
  const existingUser = task.users.find((user) => user.memberId === memberId);
  if (existingUser) {
    // Refresh the timestamp
    existingUser.startTime = currentTime;
    existingUser.action = action;
  } else {
    // Add new user
    task.users.push({ memberId, action, startTime: currentTime });
  }

  Blackboard.set(leader.aiBlackboard, taskKey, task);
  return true;
}

/**
 * Checks if a storage spot has available slots
 */
export function canUseStorage(leader: HumanEntity | null, storageId: EntityId, currentTime: number): boolean {
  if (!leader?.aiBlackboard) return true; // No coordination, allow usage

  const taskKey = `tribal_storage_${storageId}`;
  const task = Blackboard.get<TribalStorageTask>(leader.aiBlackboard, taskKey);

  if (!task) return true; // No task exists, can use storage

  // Filter out stale users
  const activeUsers = task.users.filter((user) => currentTime - user.startTime <= TRIBAL_TASK_TIMEOUT_HOURS);

  // Check if at max capacity
  return activeUsers.length < MAX_USERS_PER_STORAGE;
}

/**
 * Gets the number of active users for a storage spot
 */
export function getTribalStorageTaskCount(
  leader: HumanEntity | null,
  storageId: EntityId,
  currentTime: number,
): number {
  if (!leader?.aiBlackboard) return 0;

  const taskKey = `tribal_storage_${storageId}`;
  const task = Blackboard.get<TribalStorageTask>(leader.aiBlackboard, taskKey);

  if (!task) return 0;

  // Filter out stale users
  const activeUsers = task.users.filter((user) => currentTime - user.startTime <= TRIBAL_TASK_TIMEOUT_HOURS);

  return activeUsers.length;
}

/**
 * Removes a member from a storage task
 */
export function removeTribalStorageTask(leader: HumanEntity, storageId: EntityId, memberId: EntityId): void {
  if (!leader.aiBlackboard) return;

  const taskKey = `tribal_storage_${storageId}`;
  const task = Blackboard.get<TribalStorageTask>(leader.aiBlackboard, taskKey);

  if (!task) return;

  task.users = task.users.filter((user) => user.memberId !== memberId);

  if (task.users.length === 0) {
    // No users left, remove task
    Blackboard.delete(leader.aiBlackboard, taskKey);
  } else {
    Blackboard.set(leader.aiBlackboard, taskKey, task);
  }
}

/**
 * Claim procreation
 */
export function registerTribalProcreationTask(
  leader: HumanEntity | null,
  maleId: EntityId,
  femaleId: EntityId,
  currentTime: number,
): void {
  if (!leader?.aiBlackboard) return;

  const taskKey = `tribal_procreation_${maleId}_${femaleId}`;
  const taskData = {
    maleId,
    femaleId,
    startTime: currentTime,
  };

  Blackboard.set(leader.aiBlackboard, taskKey, taskData);
}

/**
 * Checks if a procreation task is already assigned for a specific pair
 */
export function isTribalProcreationTaskAssigned(
  leader: HumanEntity | null,
  maleId: EntityId,
  femaleId: EntityId,
  currentTime: number,
): boolean {
  if (!leader?.aiBlackboard) return false;

  const taskKey = `tribal_procreation_${maleId}_${femaleId}`;
  const task = Blackboard.get<{ maleId: EntityId; femaleId: EntityId; startTime: number }>(
    leader.aiBlackboard,
    taskKey,
  );

  if (!task) return false;

  return currentTime - task.startTime <= TRIBAL_TASK_TIMEOUT_HOURS;
}

/**
 * Removes a procreation task
 */
export function removeTribalProcreationTask(leader: HumanEntity, maleId: EntityId, femaleId: EntityId): void {
  if (!leader.aiBlackboard) return;

  const taskKey = `tribal_procreation_${maleId}_${femaleId}`;
  Blackboard.delete(leader.aiBlackboard, taskKey);
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
      const task = data[key];

      if (task && typeof task === 'object') {
        // Handle storage tasks separately (they have a users array)
        if (key.startsWith('tribal_storage_')) {
          const storageTask = task as TribalStorageTask;
          if (storageTask.users) {
            storageTask.users = storageTask.users.filter(
              (user) => currentTime - user.startTime <= TRIBAL_TASK_TIMEOUT_HOURS,
            );
            if (storageTask.users.length === 0) {
              keysToDelete.push(key);
            } else {
              Blackboard.set(leader.aiBlackboard, key, storageTask);
            }
          }
        }
        // Handle other task types
        else if ('startTime' in task) {
          if (currentTime - (task.startTime as number) > TRIBAL_TASK_TIMEOUT_HOURS) {
            keysToDelete.push(key);
          }
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
      const task = data[key];

      if (task && typeof task === 'object') {
        // Handle storage tasks
        if (key.startsWith('tribal_storage_')) {
          const storageTask = task as TribalStorageTask;
          if (storageTask.users) {
            storageTask.users = storageTask.users.filter((user) => user.memberId !== memberId);
            if (storageTask.users.length === 0) {
              keysToDelete.push(key);
            } else {
              Blackboard.set(leader.aiBlackboard, key, storageTask);
            }
          }
        }
        // Check gather/plant tasks
        else if ('memberId' in task && task.memberId === memberId) {
          keysToDelete.push(key);
        }
        // Check hunt/attack tasks
        else if ('memberIds' in task && Array.isArray(task.memberIds)) {
          const huntTask = task as TribalHuntTask;
          huntTask.memberIds = huntTask.memberIds.filter((id) => id !== memberId);

          if (huntTask.memberIds.length === 0) {
            keysToDelete.push(key);
          } else {
            Blackboard.set(leader.aiBlackboard, key, huntTask);
          }
        }
      }
    }
  }

  for (const key of keysToDelete) {
    Blackboard.delete(leader.aiBlackboard, key);
  }
}
