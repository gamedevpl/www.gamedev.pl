import { CharacterEntity } from '../../../entities/characters/character-types';
import { UpdateContext } from '../../../world-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { btProfiler } from '../bt-profiler';
import { unpackStatus } from './utils';
import { EntityId } from '../../../entities/entities-types';
import { getTribeLeaderForCoordination, TRIBAL_TASK_TIMEOUT_HOURS } from '../../../utils/tribe-task-utils';

/**
 * Task types that can be coordinated
 */
export type TribalTaskType = 'gather' | 'hunt' | 'plant' | 'storage' | 'procreation';

/**
 * Configuration for different task types
 */
export type TribalTaskConfig = {
  /** Type of the task */
  taskType: TribalTaskType;

  /** Maximum number of members that can work on the same task simultaneously */
  maxCapacity?: number;

  /** For proximity-based tasks (like planting), the radius to check */
  proximityRadius?: number;

  /** Function to extract the task target ID from the entity or blackboard */
  getTargetId?: (entity: CharacterEntity, context: UpdateContext, blackboard: BlackboardData) => EntityId | null;

  /** Custom key generator for the task (if not using default) */
  generateTaskKey?: (taskType: TribalTaskType, target: EntityId) => string;

  /** Action type for storage tasks */
  storageAction?: 'deposit' | 'retrieve';
};

/**
 * Task data stored in the blackboard
 */
type TaskData = {
  memberIds: EntityId[];
  startTime: number;
  maxCapacity: number;
};

/**
 * A generic decorator node for tribal task coordination.
 *
 * This decorator wraps a behavior node and handles:
 * - Checking if the task is available (not at max capacity)
 * - Registering the entity as working on the task
 * - Maintaining the task registration while the child is RUNNING
 * - Cleaning up the task when the child completes or fails
 * - Handling task timeouts
 *
 * The decorator is parameterized to work with different task types:
 * - gather: One member per food source
 * - hunt: Multiple members per prey (configurable max)
 * - plant: One member per position (with proximity check)
 * - storage: Multiple members per storage (configurable max)
 * - procreation: One pair at a time
 */
export class TribalTaskDecorator<T extends CharacterEntity> extends BehaviorNode<T> {
  public name: string;
  public depth: number;

  private readonly registeredKey: string;

  constructor(
    public readonly child: BehaviorNode<T>,
    private readonly config: TribalTaskConfig,
    name: string,
    depth: number = 0,
  ) {
    super();
    this.name = name;
    this.depth = depth;
    this.child.depth = (this.depth ?? 0) + 1;
    this.registeredKey = `${this.name}_registered`;
  }

  execute(entity: T, context: UpdateContext, blackboard: BlackboardData): NodeStatus {
    btProfiler.nodeStart(this.name);
    try {
      const leader = getTribeLeaderForCoordination(entity as any, context.gameState);

      // If no leader for coordination, just execute the child normally
      if (!leader || !leader.aiBlackboard) {
        const [childStatus, debugInfo] = unpackStatus(this.child.execute(entity, context, blackboard));
        this.setLastStatus(entity, childStatus);
        Blackboard.recordNodeExecution(
          blackboard,
          this.name,
          childStatus,
          context.gameState.time,
          this.depth,
          `No coordination: ${debugInfo}`,
        );
        return childStatus;
      }

      const currentTime = context.gameState.time;
      const isAlreadyRegistered = Blackboard.get<boolean>(blackboard, this.registeredKey) ?? false;

      // Get the task target
      const target = this.getTaskTarget(entity, context, blackboard);
      if (!target) {
        // No target available, fail
        this.setLastStatus(entity, NodeStatus.FAILURE);
        Blackboard.recordNodeExecution(
          blackboard,
          this.name,
          NodeStatus.FAILURE,
          currentTime,
          this.depth,
          'No task target found',
        );
        return NodeStatus.FAILURE;
      }

      const taskKey = this.getTaskKey(target);

      // If already registered, just execute the child and maintain the registration
      if (isAlreadyRegistered) {
        const [childStatus, debugInfo] = unpackStatus(this.child.execute(entity, context, blackboard));

        if (childStatus === NodeStatus.RUNNING) {
          // Still running, refresh the task timestamp
          this.refreshTaskTimestamp(leader.aiBlackboard, taskKey, entity.id, currentTime);
          this.setLastStatus(entity, childStatus);
          Blackboard.recordNodeExecution(
            blackboard,
            this.name,
            childStatus,
            currentTime,
            this.depth,
            `Continuing: ${debugInfo}`,
          );
          return childStatus;
        } else {
          // Child completed or failed, cleanup
          this.removeFromTask(leader.aiBlackboard, taskKey, entity.id);
          Blackboard.delete(blackboard, this.registeredKey);
          this.setLastStatus(entity, childStatus);
          Blackboard.recordNodeExecution(
            blackboard,
            this.name,
            childStatus,
            currentTime,
            this.depth,
            `Completed: ${debugInfo}`,
          );
          return childStatus;
        }
      }

      // Not yet registered, check if we can join the task
      const canJoin = this.canJoinTask(leader.aiBlackboard, taskKey, entity.id, currentTime);

      if (!canJoin) {
        this.setLastStatus(entity, NodeStatus.FAILURE);
        const taskData = Blackboard.get<TaskData>(leader.aiBlackboard, taskKey);
        const currentCount = taskData?.memberIds.length ?? 0;
        const maxCapacity = this.config.maxCapacity ?? 1;
        Blackboard.recordNodeExecution(
          blackboard,
          this.name,
          NodeStatus.FAILURE,
          currentTime,
          this.depth,
          `Task full: ${currentCount}/${maxCapacity}`,
        );
        return NodeStatus.FAILURE;
      }

      // Register the task
      const registered = this.registerTask(leader.aiBlackboard, taskKey, entity.id, currentTime);

      if (!registered) {
        this.setLastStatus(entity, NodeStatus.FAILURE);
        Blackboard.recordNodeExecution(
          blackboard,
          this.name,
          NodeStatus.FAILURE,
          currentTime,
          this.depth,
          'Failed to register task',
        );
        return NodeStatus.FAILURE;
      }

      // Mark as registered in the entity's blackboard
      Blackboard.set(blackboard, this.registeredKey, true);

      // Execute the child
      const [childStatus, debugInfo] = unpackStatus(this.child.execute(entity, context, blackboard));

      if (childStatus === NodeStatus.RUNNING) {
        // Child is running, keep the task registered
        this.setLastStatus(entity, childStatus);
        const taskData = Blackboard.get<TaskData>(leader.aiBlackboard, taskKey);
        const currentCount = taskData?.memberIds.length ?? 0;
        const maxCapacity = this.config.maxCapacity ?? 1;
        Blackboard.recordNodeExecution(
          blackboard,
          this.name,
          childStatus,
          currentTime,
          this.depth,
          `Started (${currentCount}/${maxCapacity}): ${debugInfo}`,
        );
        return childStatus;
      } else {
        // Child completed or failed immediately, cleanup
        this.removeFromTask(leader.aiBlackboard, taskKey, entity.id);
        Blackboard.delete(blackboard, this.registeredKey);
        this.setLastStatus(entity, childStatus);
        Blackboard.recordNodeExecution(
          blackboard,
          this.name,
          childStatus,
          currentTime,
          this.depth,
          `Immediate result: ${debugInfo}`,
        );
        return childStatus;
      }
    } finally {
      btProfiler.nodeEnd();
    }
  }

  /**
   * Gets the task target from the entity or blackboard
   */
  private getTaskTarget(entity: T, context: UpdateContext, blackboard: BlackboardData): EntityId | null {
    if (this.config.taskType === 'procreation') {
      return this.config.getTargetId?.(entity, context, blackboard) ?? null;
    }

    // Try to get target ID first (preferred for all types if available)
    const targetId = this.config.getTargetId?.(entity, context, blackboard);
    if (targetId !== null && targetId !== undefined) {
      return targetId;
    }

    return null;
  }

  /**
   * Generates a task key for the blackboard
   */
  private getTaskKey(target: EntityId): string {
    if (this.config.generateTaskKey) {
      return this.config.generateTaskKey(this.config.taskType, target);
    }

    // Default key generation
    return `tribal_${this.config.taskType}_${target}`;
  }

  /**
   * Checks if the entity can join the task
   */
  private canJoinTask(
    leaderBlackboard: BlackboardData,
    taskKey: string,
    entityId: EntityId,
    currentTime: number,
  ): boolean {
    const task = Blackboard.get<TaskData>(leaderBlackboard, taskKey);

    if (!task) {
      // No task exists, can start
      return true;
    }

    // Check if task is stale
    if (currentTime - task.startTime > TRIBAL_TASK_TIMEOUT_HOURS) {
      // Task is stale, can take over
      return true;
    }

    // Check if already in the task
    if (task.memberIds.includes(entityId)) {
      return true;
    }

    // Check capacity
    const maxCapacity = this.config.maxCapacity ?? 1;
    return task.memberIds.length < maxCapacity;
  }

  /**
   * Registers the entity for the task
   */
  private registerTask(
    leaderBlackboard: BlackboardData,
    taskKey: string,
    entityId: EntityId,
    currentTime: number,
  ): boolean {
    let task = Blackboard.get<TaskData>(leaderBlackboard, taskKey);

    if (!task) {
      // Create new task
      task = {
        memberIds: [entityId],
        startTime: currentTime,
        maxCapacity: this.config.maxCapacity ?? 1,
      };

      Blackboard.set(leaderBlackboard, taskKey, task);
      return true;
    }

    // Check if task is stale and reset it
    if (currentTime - task.startTime > TRIBAL_TASK_TIMEOUT_HOURS) {
      task = {
        memberIds: [entityId],
        startTime: currentTime,
        maxCapacity: this.config.maxCapacity ?? 1,
      };

      Blackboard.set(leaderBlackboard, taskKey, task);
      return true;
    }

    // Check if already at max capacity
    if (task.memberIds.length >= (this.config.maxCapacity ?? 1)) {
      // Check if already registered
      if (task.memberIds.includes(entityId)) {
        return true;
      }
      return false;
    }

    // Check if already registered
    if (task.memberIds.includes(entityId)) {
      return true;
    }

    // Add to task
    task.memberIds.push(entityId);
    Blackboard.set(leaderBlackboard, taskKey, task);
    return true;
  }

  /**
   * Refreshes the task timestamp to prevent timeout
   */
  private refreshTaskTimestamp(
    leaderBlackboard: BlackboardData,
    taskKey: string,
    entityId: EntityId,
    currentTime: number,
  ): void {
    const task = Blackboard.get<TaskData>(leaderBlackboard, taskKey);
    if (task && task.memberIds.includes(entityId)) {
      task.startTime = currentTime;
      Blackboard.set(leaderBlackboard, taskKey, task);
    }
  }

  /**
   * Removes the entity from the task
   */
  private removeFromTask(leaderBlackboard: BlackboardData, taskKey: string, entityId: EntityId): void {
    const task = Blackboard.get<TaskData>(leaderBlackboard, taskKey);
    if (!task) return;

    task.memberIds = task.memberIds.filter((id) => id !== entityId);

    if (task.memberIds.length === 0) {
      // No members left, remove task
      Blackboard.delete(leaderBlackboard, taskKey);
    } else {
      Blackboard.set(leaderBlackboard, taskKey, task);
    }
  }
}
