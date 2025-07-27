import { EntityId } from '../entities/entities-types';
import { Vector2D } from '../utils/math-types';

/**
 * Defines a rectangular area.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Defines a circular area.
 */
export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export enum NotificationType {
  Hello = 'HELLO',
  NewTribeFormed = 'NEW_TRIBE_FORMED',
  NoHeir = 'NO_HEIR',
  ChildrenStarving = 'CHILDREN_STARVING',
}

export interface Notification {
  id: string; // Unique ID for the notification
  identifier?: string; // Optional unique identifier for idempotent notifications
  type: NotificationType;
  message: string;
  timestamp: number; // Game time when the notification was created
  creationTime: number; // Real-world timestamp (Date.now()) for animation
  duration: number; // How long the notification should be displayed in game hours. 0 for permanent until dismissed.
  isDismissed: boolean; // Flag to indicate if the user has dismissed it
  dismissedUntil?: number; // Game time until which the notification should not reappear after being dismissed

  // --- Generic Targeting ---
  /** IDs of entities to scroll to when the notification is clicked. */
  targetEntityIds?: EntityId[];
  /** IDs of entities to highlight. */
  highlightedEntityIds?: EntityId[];
  /** A specific position to scroll to. */
  targetPosition?: Vector2D;
  /** A rectangular area to highlight or focus on. */
  targetArea?: Rect;
  /** A circular area to highlight or focus on. */
  targetRadius?: Circle;
}
