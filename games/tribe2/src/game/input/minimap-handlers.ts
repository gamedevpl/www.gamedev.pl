import { GameWorldState } from '../world-types';
import { getOwnerOfPoint } from '../utils';
import { Vector2D } from '../utils/math-types';
import { Rect } from '../notifications/notification-types';

/**
 * Handles mouse down on the minimap to start dragging/navigating.
 */
export function handleMinimapMouseDown(mouseX: number, mouseY: number, gameState: GameWorldState): void {
  if (!gameState.minimapRect) return;

  const { x, y, width, height } = gameState.minimapRect;
  if (mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height) {
    gameState.isDraggingMinimap = true;
    gameState.minimapDragDistance = 0;
  }
}

/**
 * Handles mouse up to stop dragging the minimap.
 */
export function handleMinimapMouseUp(
  mouseX: number,
  mouseY: number,
  gameState: GameWorldState,
  viewportCenterRef?: { current: Vector2D },
): void {
  if (gameState.isDraggingMinimap) {
    gameState.isDraggingMinimap = false;

    // If it was a short drag/click, ensure we navigate there smoothly
    if (gameState.minimapDragDistance < 5) {
      handleMinimapClick(mouseX, mouseY, gameState, viewportCenterRef, false);
    }
  }
}

/**
 * Handles mouse movement over the minimap to navigate or detect hover.
 */
export function handleMinimapMove(
  mouseX: number,
  mouseY: number,
  gameState: GameWorldState,
  delta?: Vector2D,
  viewportCenterRef?: { current: Vector2D },
): void {
  if (!gameState.minimapRect) {
    gameState.hoveredMinimapTribeId = null;
    return;
  }

  if (gameState.isDraggingMinimap) {
    if (delta) {
      gameState.minimapDragDistance += Math.sqrt(delta.x * delta.x + delta.y * delta.y);

      // Pan the camera based on relative mouse movement
      gameState.cameraFollowingPlayer = false;
      gameState.cameraTargetPosition = undefined;

      const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
      const { width: rectWidth, height: rectHeight } = gameState.minimapRect;

      const worldDX = (delta.x / rectWidth) * worldWidth;
      const worldDY = (delta.y / rectHeight) * worldHeight;

      // Inverted: Subtract delta so the terrain follows the mouse (grab-and-pull)
      const newX = gameState.viewportCenter.x - worldDX;
      const newY = gameState.viewportCenter.y - worldDY;

      const wrappedPos = {
        x: ((newX % worldWidth) + worldWidth) % worldWidth,
        y: ((newY % worldHeight) + worldHeight) % worldHeight,
      };

      gameState.viewportCenter = wrappedPos;
      if (viewportCenterRef) {
        viewportCenterRef.current = wrappedPos;
      }
    }
    return;
  }

  const worldPos = screenToWorldLinear(mouseX, mouseY, gameState.minimapRect, gameState);
  if (worldPos) {
    gameState.hoveredMinimapTribeId = getOwnerOfPoint(worldPos.x, worldPos.y, gameState);
  } else {
    gameState.hoveredMinimapTribeId = null;
  }
}

/**
 * Handles clicks on the minimap to navigate the camera.
 * @param immediate If true, snaps the camera instantly. If false, sets a target for smooth scrolling.
 */
export function handleMinimapClick(
  mouseX: number,
  mouseY: number,
  gameState: GameWorldState,
  viewportCenterRef?: { current: Vector2D },
  immediate: boolean = false,
): void {
  if (!gameState.minimapRect) return;

  const worldPos = screenToWorldLinear(mouseX, mouseY, gameState.minimapRect, gameState);
  if (worldPos) {
    gameState.cameraFollowingPlayer = false;

    if (immediate) {
      gameState.viewportCenter = worldPos;
      gameState.cameraTargetPosition = undefined;
      // Update the React ref to immediately move the camera
      if (viewportCenterRef) {
        viewportCenterRef.current = worldPos;
      }
    } else {
      gameState.cameraTargetPosition = worldPos;
    }
  }
}

/**
 * Handles mouse wheel/touchpad scroll over the minimap to pan the camera.
 */
export function handleMinimapWheel(
  event: WheelEvent,
  mouseX: number,
  mouseY: number,
  gameState: GameWorldState,
  viewportCenterRef?: { current: Vector2D },
): boolean {
  if (!gameState.minimapRect) return false;

  const { x, y, width, height } = gameState.minimapRect;
  if (mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height) {
    gameState.cameraFollowingPlayer = false;
    gameState.cameraTargetPosition = undefined;

    const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

    // Scale wheel delta to world movement
    const worldDX = (event.deltaX / width) * worldWidth;
    const worldDY = (event.deltaY / height) * worldHeight;

    // Note: Kept as addition because touchpad scrolling already feels correct
    const newX = gameState.viewportCenter.x + worldDX;
    const newY = gameState.viewportCenter.y + worldDY;

    const wrappedPos = {
      x: ((newX % worldWidth) + worldWidth) % worldWidth,
      y: ((newY % worldHeight) + worldHeight) % worldHeight,
    };

    gameState.viewportCenter = wrappedPos;
    if (viewportCenterRef) {
      viewportCenterRef.current = wrappedPos;
    }

    return true;
  }

  return false;
}

/**
 * Translates 2D coordinates on the minimap rectangle to world coordinates.
 * This logic assumes a "rolling" minimap centered on the current viewportCenter.
 */
function screenToWorldLinear(mouseX: number, mouseY: number, rect: Rect, gameState: GameWorldState): Vector2D | null {
  const dx = mouseX - rect.x;
  const dy = mouseY - rect.y;

  // Check if point is inside the minimap rectangle
  if (dx < 0 || dx > rect.width || dy < 0 || dy > rect.height) {
    return null;
  }

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  // The center of the minimap corresponds to the current viewportCenter
  const screenCenterX = rect.width / 2;
  const screenCenterY = rect.height / 2;

  // Offset from minimap center in screen pixels
  const screenOffsetX = dx - screenCenterX;
  const screenOffsetY = dy - screenCenterY;

  // Map screen offset to world offset
  // One full minimap width/height corresponds to one full world width/height
  const worldOffsetX = (screenOffsetX / rect.width) * worldWidth;
  const worldOffsetY = (screenOffsetY / rect.height) * worldHeight;

  // Final world position relative to current viewport center
  const worldX = gameState.viewportCenter.x + worldOffsetX;
  const worldY = gameState.viewportCenter.y + worldOffsetY;

  return {
    x: ((worldX % worldWidth) + worldWidth) % worldWidth,
    y: ((worldY % worldHeight) + worldHeight) % worldHeight,
  };
}
