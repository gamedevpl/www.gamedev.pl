import { GameWorldState } from '../world-types';
import { Vector2D } from '../utils/math-types';

/**
 * Handles mouse wheel/touchpad scrolling over the main viewport.
 */
export function handleViewportWheel(
  event: WheelEvent,
  gameState: GameWorldState,
  viewportCenterRef: { current: Vector2D },
): boolean {
  // Disable camera following when the user starts manual navigation
  gameState.cameraFollowingPlayer = false;
  gameState.cameraTargetPosition = undefined;

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  // Scale wheel delta to world movement (1:1 mapping for simplicity)
  const newX = gameState.viewportCenter.x + event.deltaX;
  const newY = gameState.viewportCenter.y + event.deltaY;

  const wrappedPos = {
    x: ((newX % worldWidth) + worldWidth) % worldWidth,
    y: ((newY % worldHeight) + worldHeight) % worldHeight,
  };

  gameState.viewportCenter = wrappedPos;
  viewportCenterRef.current = wrappedPos;

  return true;
}

/**
 * Handles mouse down on the viewport to start dragging.
 */
export function handleViewportMouseDown(event: MouseEvent, gameState: GameWorldState): void {
  // Only allow middle (1) or right (2) click dragging to avoid conflict with autopilot left clicks
  if (event.button === 1 || event.button === 2) {
    gameState.isDraggingViewport = true;
    gameState.viewportDragButton = event.button;
    gameState.viewportDragDistance = 0;
  }
}

/**
 * Handles mouse movement for viewport dragging.
 */
export function handleViewportMouseMove(
  event: MouseEvent,
  gameState: GameWorldState,
  viewportCenterRef: { current: Vector2D },
): void {
  if (gameState.isDraggingViewport) {
    gameState.viewportDragDistance += Math.sqrt(event.movementX * event.movementX + event.movementY * event.movementY);

    // Pan the camera based on relative mouse movement
    gameState.cameraFollowingPlayer = false;
    gameState.cameraTargetPosition = undefined;

    const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

    // Inverted: Subtract movement so the terrain follows the mouse (natural grab-and-pull)
    const newX = gameState.viewportCenter.x - event.movementX;
    const newY = gameState.viewportCenter.y - event.movementY;

    const wrappedPos = {
      x: ((newX % worldWidth) + worldWidth) % worldWidth,
      y: ((newY % worldHeight) + worldHeight) % worldHeight,
    };

    gameState.viewportCenter = wrappedPos;
    viewportCenterRef.current = wrappedPos;
  }
}

/**
 * Handles mouse up to stop viewport dragging.
 */
export function handleViewportMouseUp(event: MouseEvent, gameState: GameWorldState): void {
  if (gameState.isDraggingViewport && event.button === gameState.viewportDragButton) {
    gameState.isDraggingViewport = false;
    gameState.viewportDragButton = null;
  }
}
