import { GameWorldState } from '../../world-types';
import {
  UI_MINIMAP_SIZE,
  UI_MINIMAP_MARGIN,
  UI_MINIMAP_BORDER_COLOR,
  UI_MINIMAP_BACKGROUND_COLOR,
  UI_BUTTON_BACKGROUND_COLOR,
  UI_BUTTON_TEXT_COLOR,
  UI_BUTTON_ACTIVE_BACKGROUND_COLOR,
} from '../../ui/ui-consts';
import { TERRITORY_COLORS, TERRITORY_OWNERSHIP_RESOLUTION } from '../../entities/tribe/territory-consts';
import { ClickableUIButton, UIButtonActionType, TribeInfo } from '../../ui/ui-types';
import { EntityId } from '../../entities/entities-types';
import { getDirectionVectorOnTorus } from '../../utils/math-utils';
import { Vector2D } from '../../utils/math-types';

/**
 * Renders an interactive centered "rolling" minimap with a cartographic style.
 * Displays territory ownership relative to the current viewport center.
 */
export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: Vector2D,
  tribes: TribeInfo[],
  canvasWidth: number,
  canvasHeight: number,
  cameraZoom: number,
): void {
  const buttonSize = 30;
  const spacing = 8;
  const totalHeight = UI_MINIMAP_SIZE + spacing + buttonSize;

  const rect = {
    x: UI_MINIMAP_MARGIN,
    y: canvasHeight - UI_MINIMAP_MARGIN - totalHeight,
    width: UI_MINIMAP_SIZE,
    height: UI_MINIMAP_SIZE,
  };

  // Update gameState with minimap position for input handling
  gameState.minimapRect = rect;

  ctx.save();

  // --- 1. Background and Border ---
  ctx.fillStyle = UI_MINIMAP_BACKGROUND_COLOR;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.strokeStyle = UI_MINIMAP_BORDER_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  // --- 2. Render Territories (Centered on Viewport) ---
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / TERRITORY_OWNERSHIP_RESOLUTION);

  // Setup color map for tribes
  const colorMap = new Map<EntityId, string>();
  tribes.forEach((t, i) => {
    const colorIndex = t.isPlayerTribe ? 0 : (i % (TERRITORY_COLORS.length - 1)) + 1;
    colorMap.set(t.leaderId, TERRITORY_COLORS[colorIndex]);
  });

  const cellWidth = rect.width / gridWidth;
  const cellHeight = rect.height / gridHeight;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  // Optimized rendering step
  const step = gridWidth > 400 ? 4 : gridWidth > 200 ? 2 : 1;

  for (let gy = 0; gy < gridHeight; gy += step) {
    for (let gx = 0; gx < gridWidth; gx += step) {
      const index = gy * gridWidth + gx;
      const ownerId = gameState.terrainOwnership[index];

      if (ownerId !== null) {
        // Calculate world position of cell center
        const worldX = (gx + 0.5) * TERRITORY_OWNERSHIP_RESOLUTION;
        const worldY = (gy + 0.5) * TERRITORY_OWNERSHIP_RESOLUTION;

        // Shortest offset from viewport center (toroidal)
        const offset = getDirectionVectorOnTorus(viewportCenter, { x: worldX, y: worldY }, worldWidth, worldHeight);

        // Map world offset to minimap screen coordinates
        const sx = centerX + (offset.x / worldWidth) * rect.width;
        const sy = centerY + (offset.y / worldHeight) * rect.height;

        const isHovered = gameState.hoveredMinimapTribeId === ownerId;
        ctx.fillStyle = colorMap.get(ownerId) || '#888';

        if (isHovered) {
          const pulse = (Math.sin(gameState.time * 5) + 1) / 2;
          ctx.globalAlpha = 0.6 + pulse * 0.4;
        } else {
          ctx.globalAlpha = 0.8;
        }

        ctx.fillRect(sx - (cellWidth * step) / 2, sy - (cellHeight * step) / 2, cellWidth * step, cellHeight * step);
      }
    }
  }
  ctx.globalAlpha = 1.0;

  // --- 3. Render Static Viewport Indicator ---
  const viewportWidth = canvasWidth / cameraZoom;
  const viewportHeight = canvasHeight / cameraZoom;

  const mw = (viewportWidth / worldWidth) * rect.width;
  const mh = (viewportHeight / worldHeight) * rect.height;

  ctx.save();
  // Clip to minimap area
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2;

  // Static centered viewport box
  ctx.strokeRect(centerX - mw / 2, centerY - mh / 2, mw, mh);
  ctx.restore();

  ctx.restore();

  // --- 4. Navigation Buttons (Below the Minimap) ---
  const buttonsY = rect.y + rect.height + spacing;

  // --- Center Button (Left) ---
  const centerButtonX = rect.x;
  const centerButtonY = buttonsY;
  const centerButtonId = 'recenter_camera_btn';

  const centerButton: ClickableUIButton = {
    id: centerButtonId,
    action: UIButtonActionType.RecenterCamera,
    rect: { x: centerButtonX, y: centerButtonY, width: buttonSize, height: buttonSize },
    text: '',
    currentWidth: buttonSize,
    backgroundColor: gameState.cameraFollowingPlayer ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR,
    textColor: UI_BUTTON_TEXT_COLOR,
    tooltip: 'Lock camera to player',
  };
  gameState.uiButtons.push(centerButton);

  // Draw Center Button
  ctx.fillStyle = gameState.hoveredButtonId === centerButtonId ? '#4a5568' : centerButton.backgroundColor;
  ctx.fillRect(centerButtonX, centerButtonY, buttonSize, buttonSize);
  ctx.strokeStyle = '#666';
  ctx.strokeRect(centerButtonX, centerButtonY, buttonSize, buttonSize);

  // Draw Crosshair Icon
  const iconCenterX = centerButtonX + buttonSize / 2;
  const iconCenterY = centerButtonY + buttonSize / 2;
  const iconRadius = buttonSize * 0.35;

  ctx.strokeStyle = UI_BUTTON_TEXT_COLOR;
  ctx.lineWidth = 2;

  // Outer circle
  ctx.beginPath();
  ctx.arc(iconCenterX, iconCenterY, iconRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair lines
  const crosshairSize = iconRadius * 0.6;
  ctx.beginPath();
  // Horizontal
  ctx.moveTo(iconCenterX - crosshairSize, iconCenterY);
  ctx.lineTo(iconCenterX + crosshairSize, iconCenterY);
  // Vertical
  ctx.moveTo(iconCenterX, iconCenterY - crosshairSize);
  ctx.lineTo(iconCenterX, iconCenterY + crosshairSize);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
  ctx.beginPath();
  ctx.arc(iconCenterX, iconCenterY, 2, 0, Math.PI * 2);
  ctx.fill();

  // --- List Button (Right of Center Button) ---
  const listButtonId = 'open_tribe_modal_btn';
  const listButtonText = `Tribes (${tribes.length})`;

  ctx.font = '10px "Press Start 2P", Arial';
  const textMetrics = ctx.measureText(listButtonText);
  const listButtonWidth = Math.max(buttonSize, textMetrics.width + 16);
  const listButtonHeight = buttonSize;

  const listButtonX = centerButtonX + buttonSize + spacing;
  const listButtonY = buttonsY;

  const listButton: ClickableUIButton = {
    id: listButtonId,
    action: UIButtonActionType.OpenTribeModal,
    rect: { x: listButtonX, y: listButtonY, width: listButtonWidth, height: listButtonHeight },
    text: listButtonText,
    currentWidth: listButtonWidth,
    backgroundColor: UI_BUTTON_BACKGROUND_COLOR,
    textColor: UI_BUTTON_TEXT_COLOR,
    tooltip: 'View all tribes and diplomacy',
  };
  gameState.uiButtons.push(listButton);

  // Draw List Button
  ctx.fillStyle = gameState.hoveredButtonId === listButtonId ? '#4a5568' : UI_BUTTON_BACKGROUND_COLOR;
  ctx.fillRect(listButtonX, listButtonY, listButtonWidth, listButtonHeight);
  ctx.strokeStyle = '#666';
  ctx.strokeRect(listButtonX, listButtonY, listButtonWidth, listButtonHeight);

  ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(listButtonText, listButtonX + listButtonWidth / 2, listButtonY + listButtonHeight / 2);
}
