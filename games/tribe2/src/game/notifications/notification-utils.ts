import { GameWorldState } from '../world-types';
import { Notification } from './notification-types';
import {
  NOTIFICATION_DISMISS_COOLDOWN_HOURS
} from '../notification-consts.ts';

let nextNotificationId = 0;
function generateNotificationId(): string {
  return `notification-${Date.now()}-${nextNotificationId++}`;
}

/**
 * Adds or updates a notification in the game state.
 * Handles idempotency using an optional 'identifier'.
 * @param world The game world state.
 * @param notification The notification object, without id, timestamp, or isDismissed.
 */
export function addNotification(
  world: GameWorldState,
  notification: Omit<Notification, 'id' | 'timestamp' | 'creationTime' | 'isDismissed' | 'dismissedUntil'>,
): void {
  if (notification.identifier) {
    const existing = world.notifications.find((n) => n.identifier === notification.identifier);
    if (existing) {
      // If the notification is on cooldown from being dismissed, do nothing.
      if (existing.dismissedUntil && world.time < existing.dismissedUntil) {
        return;
      }
      // Otherwise, update the existing notification to make it active again.
      existing.message = notification.message;
      existing.timestamp = world.time;
      existing.creationTime = Date.now(); // Reset creation time for animation
      existing.duration = notification.duration;
      existing.targetEntityIds = notification.targetEntityIds;
      existing.highlightedEntityIds = notification.highlightedEntityIds;
      existing.targetPosition = notification.targetPosition;
      existing.targetArea = notification.targetArea;
      existing.targetRadius = notification.targetRadius;
      existing.isDismissed = false;
      existing.dismissedUntil = undefined;
      return;
    }
  }

  // If no identifier or no existing notification, create a new one.
  const newNotification: Notification = {
    ...notification,
    id: generateNotificationId(),
    timestamp: world.time,
    creationTime: Date.now(),
    isDismissed: false,
  };
  world.notifications.push(newNotification);
}

/**
 * Marks a notification as dismissed and sets a cooldown.
 * @param world The game world state.
 * @param notificationId The ID of the notification to dismiss.
 */
export function dismissNotification(world: GameWorldState, notificationId: string): void {
  const notification = world.notifications.find((n) => n.id === notificationId);
  if (notification) {
    notification.isDismissed = true;
    // Only set a cooldown for notifications that can reappear (have an identifier)
    if (notification.identifier) {
      notification.dismissedUntil = world.time + NOTIFICATION_DISMISS_COOLDOWN_HOURS;
    }
  }
}

/**
 * Updates the state of notifications, removing expired ones.
 * This should be called in the main game update loop.
 * @param world The game world state.
 */
export function updateNotifications(world: GameWorldState): void {
  const currentTime = world.time;

  // Filter out notifications that have expired (duration passed).
  // Dismissed notifications are kept until they expire or are replaced.
  world.notifications = world.notifications.filter((notification) => {
    if (notification.duration === 0) {
      // 0 duration means it's permanent until dismissed by the player.
      return true;
    }
    const hasExpired = currentTime - notification.timestamp > notification.duration;
    return !hasExpired;
  });
}
