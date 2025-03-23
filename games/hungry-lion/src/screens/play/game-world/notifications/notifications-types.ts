import { Vector2D } from '../utils/math-types';

/**
 * Notification categories in the game
 */
export type NotificationCategory = 'combat' | 'system' | 'status';

/**
 * Combat notification types
 */
export type CombatNotificationType = 'hit' | 'miss' | 'damage' | 'critical';

/**
 * System notification types
 */
export type SystemNotificationType = 'warning' | 'info' | 'error';

/**
 * Status notification types
 */
export type StatusNotificationType = 'health' | 'hunger' | 'stamina';

/**
 * Union of all notification types
 */
export type NotificationType = 
  | { category: 'combat'; type: CombatNotificationType }
  | { category: 'system'; type: SystemNotificationType }
  | { category: 'status'; type: StatusNotificationType };

/**
 * Base notification interface
 */
export interface Notification {
  /** Unique notification identifier */
  id: number;
  /** Type of notification */
  notificationType: NotificationType;
  /** Message to display */
  message: string;
  /** Position in the game world */
  position: Vector2D;
  /** Time when the notification was created */
  createdAt: number;
  /** Duration in milliseconds */
  duration: number;
  /** Optional offset for positioning */
  offset?: Vector2D;
  /** Optional color override */
  color?: string;
  /** Optional font size */
  fontSize?: number;
}

/**
 * Combat notification interface
 */
export interface CombatNotification extends Notification {
  notificationType: { category: 'combat'; type: CombatNotificationType };
}

/**
 * System notification interface
 */
export interface SystemNotification extends Notification {
  notificationType: { category: 'system'; type: SystemNotificationType };
}

/**
 * Status notification interface
 */
export interface StatusNotification extends Notification {
  notificationType: { category: 'status'; type: StatusNotificationType };
}

/**
 * Notifications state
 */
export type NotificationsState = {
  /** Active notifications */
  notifications: Notification[];
  /** Next notification ID */
  nextNotificationId: number;
};