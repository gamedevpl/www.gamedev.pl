import { GameWorldState } from '../game-world/game-world-types';
import { getPlayerLion } from '../game-world/game-world-query';
import { LionActionType } from '../game-world/entities/entities-types';
// Adjust the import path based on your project structure
import { Lion2d } from '../../../../../../tools/asset-generator/generator-assets/src/lion-2d/lion-2d';

// --- Layout Constants ---
export const ACTION_BUTTON_WIDTH = 70;
export const ACTION_BUTTON_HEIGHT = 70;
export const ACTION_BUTTON_SPACING = 10;
export const ACTION_BAR_BOTTOM_MARGIN = 20;
const ICON_WIDTH = 30;
const ICON_HEIGHT = 30;
const ICON_MARGIN_BOTTOM = 4;
const TEXT_FONT_SIZE = 12; // Approx font size in pixels
const TEXT_COLOR = 'white';
const BUTTON_BG_INACTIVE = '#808080';
const BUTTON_BG_ACTIVE = '#4CAF50';
const BUTTON_BORDER_ACTIVE = '#FFFFFF';
const BUTTON_BORDER_WIDTH = 2;
const BUTTON_RADIUS = 8;

// Define the actions to display
const ACTIONS: LionActionType[] = ['walk', 'attack', 'ambush'];

type LionStance = 'standing' | 'walking' | 'running' | 'ambushing' | 'eating';

// Structure to hold calculated button bounds
export interface ActionButtonLayout {
  action: LionActionType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActionBarLayout {
  buttons: ActionButtonLayout[];
  totalWidth: number;
  startX: number;
  startY: number;
}

/**
 * Calculates the screen positions and dimensions for the action bar buttons.
 * @param canvasWidth - The width of the canvas.
 * @param canvasHeight - The height of the canvas.
 * @returns ActionBarLayout object containing button bounds and overall dimensions.
 */
export function getActionBarLayout(canvasWidth: number, canvasHeight: number): ActionBarLayout {
  const numButtons = ACTIONS.length;
  const totalWidth = numButtons * ACTION_BUTTON_WIDTH + (numButtons - 1) * ACTION_BUTTON_SPACING;
  const startX = (canvasWidth - totalWidth) / 2;
  const startY = canvasHeight - ACTION_BAR_BOTTOM_MARGIN - ACTION_BUTTON_HEIGHT;

  const buttons: ActionButtonLayout[] = ACTIONS.map((action, index) => ({
    action,
    x: startX + index * (ACTION_BUTTON_WIDTH + ACTION_BUTTON_SPACING),
    y: startY,
    width: ACTION_BUTTON_WIDTH,
    height: ACTION_BUTTON_HEIGHT,
  }));

  return { buttons, totalWidth, startX, startY };
}

// Helper function to get the appropriate Lion stance for the icon
function getStanceForAction(action: LionActionType): LionStance {
  switch (action) {
    case 'walk':
      return 'walking';
    case 'attack':
      return 'running'; // Use 'running' stance for attack icon
    case 'ambush':
      return 'ambushing';
    default:
      return 'standing'; // Fallback
  }
}

/**
 * Draws the Action Bar onto the canvas.
 * @param ctx - The canvas rendering context.
 * @param world - The current game world state.
 * @param canvasWidth - The width of the canvas.
 * @param canvasHeight - The height of the canvas.
 */
export function drawActionBar(
  ctx: CanvasRenderingContext2D,
  world: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
) {
  const lion = getPlayerLion(world);
  const activeAction = lion?.activeAction ?? 'walk';

  const layout = getActionBarLayout(canvasWidth, canvasHeight);

  const originalSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false; // Use pixelated rendering for icons

  layout.buttons.forEach((buttonLayout) => {
    const isActive = buttonLayout.action === activeAction;

    // Draw Button Background
    ctx.fillStyle = isActive ? BUTTON_BG_ACTIVE : BUTTON_BG_INACTIVE;
    ctx.beginPath();
    ctx.roundRect(buttonLayout.x, buttonLayout.y, buttonLayout.width, buttonLayout.height, BUTTON_RADIUS);
    ctx.fill();

    // Draw Active Border
    if (isActive) {
      ctx.strokeStyle = BUTTON_BORDER_ACTIVE;
      ctx.lineWidth = BUTTON_BORDER_WIDTH;
      ctx.stroke();
    }

    // Draw Icon
    const stance = getStanceForAction(buttonLayout.action);
    const iconX = buttonLayout.x + (buttonLayout.width - ICON_WIDTH) / 2;
    // Position icon towards the top
    const iconY = buttonLayout.y + (buttonLayout.height - ICON_HEIGHT - TEXT_FONT_SIZE - ICON_MARGIN_BOTTOM) / 2;

    Lion2d.render(ctx, iconX, iconY, ICON_WIDTH, ICON_HEIGHT, 0, stance, 'right');

    // Draw Text
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `bold ${TEXT_FONT_SIZE}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const textY = buttonLayout.y + buttonLayout.height - BUTTON_RADIUS / 2; // Position text near bottom
    ctx.fillText(
      buttonLayout.action.charAt(0).toUpperCase() + buttonLayout.action.slice(1),
      buttonLayout.x + buttonLayout.width / 2,
      textY,
    );
  });

  ctx.imageSmoothingEnabled = originalSmoothing; // Restore setting
}
