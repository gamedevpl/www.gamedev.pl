import { Vector2D } from '../utils/math-types';
import { GameWorldState, UpdateContext } from '../game-world-types';
import {
  CombatNotificationType,
  Notification,
  NotificationType,
  NotificationsState,
  StatusNotificationType,
  SystemNotificationType,
} from './notifications-types';

/**
 * Default notification duration in milliseconds
 */
const DEFAULT_NOTIFICATION_DURATION = 2000;

/**
 * Initialize the notifications system
 * @returns Initialized notifications state
 */
export function notificationsInit(): NotificationsState {
  return {
    notifications: [],
    nextNotificationId: 1,
  };
}

/**
 * Add a new notification
 * @param gameState Game world state
 * @param position Position in the world
 * @param message Message to display
 * @param notificationType Type of notification
 * @param duration Optional duration in milliseconds (defaults to 2000ms)
 * @param options Optional additional properties (color, fontSize, offset)
 * @returns The created notification
 */
export function addNotification(
  gameState: GameWorldState,
  position: Vector2D,
  message: string,
  notificationType: NotificationType,
  duration: number = DEFAULT_NOTIFICATION_DURATION,
  options: { color?: string; fontSize?: number; offset?: Vector2D } = {},
): Notification {
  const notification: Notification = {
    id: gameState.notifications.nextNotificationId++,
    position: { ...position },
    message,
    notificationType,
    createdAt: gameState.time,
    duration,
    ...options,
  };

  gameState.notifications.notifications.push(notification);
  return notification;
}

/**
 * Add a combat notification
 * @param gameState Game world state
 * @param position Position in the world
 * @param message Message to display
 * @param type Combat notification type
 * @param duration Optional duration in milliseconds
 * @param options Optional additional properties
 * @returns The created notification
 */
export function addCombatNotification(
  gameState: GameWorldState,
  position: Vector2D,
  message: string,
  type: CombatNotificationType,
  duration: number = DEFAULT_NOTIFICATION_DURATION,
  options: { color?: string; fontSize?: number; offset?: Vector2D } = {},
): Notification {
  return addNotification(gameState, position, message, { category: 'combat', type }, duration, options);
}

/**
 * Add a system notification
 * @param gameState Game world state
 * @param position Position in the world
 * @param message Message to display
 * @param type System notification type
 * @param duration Optional duration in milliseconds
 * @param options Optional additional properties
 * @returns The created notification
 */
export function addSystemNotification(
  gameState: GameWorldState,
  position: Vector2D,
  message: string,
  type: SystemNotificationType,
  duration: number = DEFAULT_NOTIFICATION_DURATION,
  options: { color?: string; fontSize?: number; offset?: Vector2D } = {},
): Notification {
  return addNotification(gameState, position, message, { category: 'system', type }, duration, options);
}

/**
 * Add a status notification
 * @param gameState Game world state
 * @param position Position in the world
 * @param message Message to display
 * @param type Status notification type
 * @param duration Optional duration in milliseconds
 * @param options Optional additional properties
 * @returns The created notification
 */
export function addStatusNotification(
  gameState: GameWorldState,
  position: Vector2D,
  message: string,
  type: StatusNotificationType,
  duration: number = DEFAULT_NOTIFICATION_DURATION,
  options: { color?: string; fontSize?: number; offset?: Vector2D } = {},
): Notification {
  return addNotification(gameState, position, message, { category: 'status', type }, duration, options);
}

/**
 * Remove a notification by ID
 * @param gameState Game world state
 * @param notificationId Notification ID to remove
 * @returns True if notification was found and removed, false otherwise
 */
export function removeNotification(gameState: GameWorldState, notificationId: number): boolean {
  const index = gameState.notifications.notifications.findIndex((n) => n.id === notificationId);
  if (index === -1) return false;

  gameState.notifications.notifications.splice(index, 1);
  return true;
}

/**
 * Update notifications (advance lifetime and remove expired ones)
 * @param updateContext Update context
 */
export function notificationsUpdate(updateContext: UpdateContext): void {
  const { gameState } = updateContext;
  const currentTime = gameState.time;

  // Filter out expired notifications
  gameState.notifications.notifications = gameState.notifications.notifications.filter((notification) => {
    const age = currentTime - notification.createdAt;
    return age < notification.duration;
  });
}

/**
 * Helper function to get notification age as a ratio of its total duration
 * Useful for animations (0 = just created, 1 = about to expire)
 * @param notification The notification
 * @param currentTime Current game time
 * @returns Age ratio (0-1)
 */
export function getNotificationAgeRatio(notification: Notification, currentTime: number): number {
  const age = currentTime - notification.createdAt;
  return Math.min(Math.max(age / notification.duration, 0), 1);
}

/**
 * Helper function to add a hit notification
 * @param gameState Game world state
 * @param position Position in the world
 * @returns The created notification
 */
export function addHitNotification(gameState: GameWorldState, position: Vector2D): Notification {
  return addCombatNotification(gameState, position, 'HIT!', 'hit', 1500, {
    color: 'rgba(255, 0, 0, 0.8)',
    fontSize: 16,
    offset: { x: 0, y: -30 },
  });
}

/**
 * Helper function to add a miss notification
 * @param gameState Game world state
 * @param position Position in the world
 * @returns The created notification
 */
export function addMissNotification(gameState: GameWorldState, position: Vector2D): Notification {
  return addCombatNotification(gameState, position, 'MISS', 'miss', 1200, {
    color: 'rgba(150, 150, 150, 0.7)',
    fontSize: 14,
    offset: { x: 0, y: -25 },
  });
}

/**
 * Helper function to add a damage notification
 * @param gameState Game world state
 * @param position Position in the world
 * @param damage Amount of damage (optional)
 * @returns The created notification
 */
export function addDamageNotification(gameState: GameWorldState, position: Vector2D, damage?: number): Notification {
  const message = damage ? `-${damage}` : 'Damaged!';
  return addCombatNotification(gameState, position, message, 'damage', 1300, {
    color: 'rgba(255, 50, 50, 0.9)',
    fontSize: 15,
    offset: { x: 0, y: -35 },
  });
}
