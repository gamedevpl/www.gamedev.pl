import { Notification } from '../../game-world/notifications/notifications-types';
import { getNotificationAgeRatio } from '../../game-world/notifications/notifications-update';
import { GameWorldState } from '../../game-world/game-world-types';

/**
 * Draw a single combat notification
 * @param ctx Canvas rendering context
 * @param notification The notification to draw
 * @param currentTime Current game time
 */
export function drawCombatNotification(
  ctx: CanvasRenderingContext2D,
  notification: Notification,
  currentTime: number,
): void {
  // Get age ratio for animation (0 = just created, 1 = about to expire)
  const ageRatio = getNotificationAgeRatio(notification, currentTime);

  // Calculate fade-in/fade-out alpha
  let alpha = 1;
  const fadeInDuration = 0.15; // First 15% of lifetime
  const fadeOutStart = 0.7; // Last 30% of lifetime

  if (ageRatio < fadeInDuration) {
    // Fade in
    alpha = ageRatio / fadeInDuration;
  } else if (ageRatio > fadeOutStart) {
    // Fade out
    alpha = 1 - (ageRatio - fadeOutStart) / (1 - fadeOutStart);
  }

  // Calculate position with offset
  const posX = notification.position.x + (notification.offset?.x || 0);
  let posY = notification.position.y + (notification.offset?.y || -30);

  // Add floating effect - move upward as the notification ages
  posY -= ageRatio * 15;

  // Add slight wobble for hit notifications
  let wobble = 0;
  if (notification.notificationType.category === 'combat' && notification.notificationType.type === 'hit') {
    wobble = Math.sin(ageRatio * Math.PI * 6) * 3 * (1 - ageRatio);
  }

  // Determine text style based on notification type
  const fontSize = notification.fontSize || 16;
  const fontStyle = 'bold';
  let color = notification.color || 'white';

  // Apply alpha to color
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    // If color is already in rgba format
    const r = rgbaMatch[1];
    const g = rgbaMatch[2];
    const b = rgbaMatch[3];
    color = `rgba(${r}, ${g}, ${b}, ${alpha * (rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1)})`;
  } else {
    // Default color handling
    color = `rgba(255, 255, 255, ${alpha})`;
  }

  // Scale effect for hit notifications
  let scale = 1;
  if (notification.notificationType.category === 'combat') {
    const type = notification.notificationType.type;
    if (type === 'hit' || type === 'critical') {
      // Pulse effect for hits
      const pulsePhase = Math.min(ageRatio * 3, 1); // Pulse happens in first third of lifetime
      scale = 1 + 0.3 * Math.sin(pulsePhase * Math.PI) * (1 - pulsePhase);
    }
  }

  // Draw text with effects
  ctx.save();

  // Apply scale and translation
  ctx.translate(posX, posY);
  ctx.scale(scale, scale);

  // Apply wobble
  if (wobble !== 0) {
    ctx.rotate(wobble * 0.03);
  }

  // Set text style
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0, 0, 0, ' + alpha * 0.8 + ')';
  ctx.lineWidth = 2;
  ctx.font = `${fontStyle} ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw text with outline for better visibility
  ctx.strokeText(notification.message, wobble, 0);
  ctx.fillText(notification.message, wobble, 0);

  ctx.restore();
}

/**
 * Draw all combat notifications
 * @param ctx Canvas rendering context
 * @param gameState Game world state
 */
export function drawCombatNotifications(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  const { notifications, time } = gameState;

  // Draw each notification
  notifications.notifications
    .filter((notification) => notification.notificationType.category === 'combat')
    .forEach((notification) => {
      drawCombatNotification(ctx, notification, time);
    });
}

/**
 * Draw all notifications (combat and other types)
 * @param ctx Canvas rendering context
 * @param gameState Game world state
 */
export function drawAllNotifications(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  const { notifications, time } = gameState;

  // Draw each notification
  notifications.notifications.forEach((notification) => {
    drawCombatNotification(ctx, notification, time);
  });
}
