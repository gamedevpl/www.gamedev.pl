import { DebugPanelType, GameWorldState } from '../world-types';
import { Vector2D } from '../utils/math-types';
import { Rect } from '../notifications/notification-types';

// --- Behavior Tree Debugger Mouse Handlers ---

function isPointInRect(point: Vector2D, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/**
 * Handles mouse wheel scrolling for the debugger panel.
 */
export const handleDebugPanelMouseWheel = (
  event: WheelEvent,
  gameState: GameWorldState,
): { newState: GameWorldState; handled: boolean } => {
  if (gameState.debugPanel !== DebugPanelType.General || !gameState.debugPanelRect || !gameState.mousePosition) {
    return { newState: gameState, handled: false };
  }

  if (isPointInRect(gameState.mousePosition, gameState.debugPanelRect)) {
    const scrollAmount = 40; // Increase scroll sensitivity
    gameState.debugPanelScroll.y += event.deltaY > 0 ? scrollAmount : -scrollAmount;

    // Clamp scrolling
    if (gameState.debugPanelScroll.y < 0) {
      gameState.debugPanelScroll.y = 0;
    }
    // The header/footer area is roughly 60px
    const visibleHeight = gameState.debugPanelRect.height - 60;
    const maxScrollY = Math.max(0, (gameState.debugPanelContentSize?.height ?? 0) - visibleHeight);
    if (gameState.debugPanelScroll.y > maxScrollY) {
      gameState.debugPanelScroll.y = maxScrollY;
    }

    event.preventDefault();
    return { newState: gameState, handled: true };
  }

  return { newState: gameState, handled: false };
};

/**
 * Handles mouse down event to initiate dragging the debugger panel content.
 */
export const handleDebugPanelMouseDown = (
  _event: MouseEvent,
  gameState: GameWorldState,
): { newState: GameWorldState; handled: boolean } => {
  if (gameState.debugPanel !== DebugPanelType.General || !gameState.debugPanelRect || !gameState.mousePosition) {
    return { newState: gameState, handled: false };
  }

  if (isPointInRect(gameState.mousePosition, gameState.debugPanelRect)) {
    gameState.isDraggingDebugPanel = true;
    return { newState: gameState, handled: true };
  }

  return { newState: gameState, handled: false };
};

/**
 * Handles mouse up event to stop dragging the debugger panel content.
 */
export const handleDebugPanelMouseUp = (
  _event: MouseEvent,
  gameState: GameWorldState,
): { newState: GameWorldState; handled: boolean } => {
  if (gameState.isDraggingDebugPanel) {
    gameState.isDraggingDebugPanel = false;
    return { newState: gameState, handled: true };
  }
  return { newState: gameState, handled: false };
};

/**
 * Handles mouse move event to drag the debugger panel content.
 */
export const handleDebugPanelMouseMove = (
  event: MouseEvent,
  gameState: GameWorldState,
): { newState: GameWorldState; handled: boolean } => {
  if (gameState.isDraggingDebugPanel && gameState.debugPanelRect) {
    gameState.debugPanelScroll.x -= event.movementX;
    gameState.debugPanelScroll.y -= event.movementY;

    // Clamp scrolling
    if (gameState.debugPanelScroll.x < 0) gameState.debugPanelScroll.x = 0;
    if (gameState.debugPanelScroll.y < 0) gameState.debugPanelScroll.y = 0;

    const visibleWidth = gameState.debugPanelRect.width - 30; // Padding
    const maxScrollX = Math.max(0, (gameState.debugPanelContentSize?.width ?? 0) - visibleWidth);
    if (gameState.debugPanelScroll.x > maxScrollX) {
      gameState.debugPanelScroll.x = maxScrollX;
    }

    const visibleHeight = gameState.debugPanelRect.height - 60; // Header/footer
    const maxScrollY = Math.max(0, (gameState.debugPanelContentSize?.height ?? 0) - visibleHeight);
    if (gameState.debugPanelScroll.y > maxScrollY) {
      gameState.debugPanelScroll.y = maxScrollY;
    }

    return { newState: gameState, handled: true };
  }
  return { newState: gameState, handled: false };
};
