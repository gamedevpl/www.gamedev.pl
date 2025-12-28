import { Entity, EntityId } from '../../entities/entities-types';
import { Circle2D, Rect2D, Vector2D } from '../../utils/math-types';
import { UpdateContext } from '../../world-types';

export enum TaskType {
  HumanGatherBerries,
  HumanGatherMeat,
  HumanEat,
  HumanProcreateFemale,
  HumanProcreateMale,
  HumanFeedChild,
}

export enum TaskPriority {
  Immediate,
  High,
  Low,
}

export enum TaskResult {
  Running,
  Success,
  Failure,
  Empty,
}

export type Task = {
  // Unique task id
  id: string;

  // Type of the task
  type: TaskType;

  // ID of the entity that created the task
  creatorEntityId: EntityId;

  // ID of the entity that claimed the task (if any)
  claimedByEntityId?: EntityId;

  // Target
  target?: EntityId | Vector2D | Rect2D | Circle2D;

  // Valid until time
  validUntilTime: number;
};

export type TaskDefinition<T extends Entity> = {
  type: TaskType;
  producer?: (entity: T, context: UpdateContext) => Record<string, Task>;
  scorer?: (entity: T, task: Task, context: UpdateContext) => number | null;
  executor?: (task: Task, entity: T, context: UpdateContext) => TaskResult;
};

export type TaskHistoryEntry = {
  type: TaskType;
  result: TaskResult;
  completedAtTick: number;
};
