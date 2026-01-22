import { GameWorldState } from '../../world-types';
import { StrategicObjective } from '../../entities/tribe/tribe-types';
import { UIButtonActionType } from '../../ui/ui-types';
import { findPlayerEntity } from '../../utils/world-utils';
import { HumanEntity } from '../../entities/characters/human/human-types';
import {
  UI_AUTOPILOT_BUTTON_SIZE,
  UI_BUTTON_ACTIVE_BACKGROUND_COLOR,
  UI_BUTTON_ACTIVATED_BORDER_COLOR,
  UI_BUTTON_HOVER_BACKGROUND_COLOR,
  UI_BUTTON_TEXT_COLOR,
  UI_BUTTON_HEIGHT,
  UI_FONT_SIZE,
  UI_PADDING,
} from '../../ui/ui-consts.ts';

export interface ObjectiveDefinition {
  objective: StrategicObjective;
  icon: string;
  name: string;
  tooltip: string;
}

export const STRATEGIC_OBJECTIVE_DEFINITIONS: ObjectiveDefinition[] = [
  {
    objective: StrategicObjective.None,
    icon: '⭕',
    name: 'None',
    tooltip: 'No specific objective. Tribe will act autonomously.',
  },
  {
    objective: StrategicObjective.GreatHarvest,
    icon: '🌾',
    name: 'Great Harvest',
    tooltip: 'Focus on gathering berries and surplus food.',
  },
  {
    objective: StrategicObjective.GreenThumb,
    icon: '🌱',
    name: 'Green Thumb',
    tooltip: 'Prioritize planting and expanding berry bushes.',
  },
  {
    objective: StrategicObjective.LumberjackFever,
    icon: '🌲',
    name: 'Lumberjack',
    tooltip: 'Focus on chopping trees and gathering wood.',
  },
  {
    objective: StrategicObjective.WinterPrep,
    icon: '🔥',
    name: 'Winter Prep',
    tooltip: 'Stockpile wood and maintain bonfires for warmth.',
  },
  {
    objective: StrategicObjective.BabyBoom,
    icon: '👶',
    name: 'Baby Boom',
    tooltip: 'Encourage procreation to grow the tribe population.',
  },
  {
    objective: StrategicObjective.ManifestDestiny,
    icon: '🎭',
    name: 'Manifest Iron',
    tooltip: 'Expand territory and seek out iron deposits.',
  },
  {
    objective: StrategicObjective.IronCurtain,
    icon: '🧱',
    name: 'Iron Curtain',
    tooltip: 'Focus on building and maintaining defensive walls.',
  },
  {
    objective: StrategicObjective.Warpath,
    icon: '⚔️',
    name: 'Warpath',
    tooltip: 'Aggressively seek out and attack rival tribes.',
  },
  {
    objective: StrategicObjective.ActiveDefense,
    icon: '🛡️',
    name: 'Defense',
    tooltip: 'Prioritize defending territory and responding to threats.',
  },
  {
    objective: StrategicObjective.RaidingParty,
    icon: '🗡️',
    name: 'Raiding',
    tooltip: 'Launch small-scale raids to steal resources from others.',
  },
];

export function getObjectiveName(objective: StrategicObjective): string {
  const found = STRATEGIC_OBJECTIVE_DEFINITIONS.find((o) => o.objective === objective);
  return found ? found.name : 'STRATEGY';
}

export function getObjectiveIcon(objective: StrategicObjective): string {
  const found = STRATEGIC_OBJECTIVE_DEFINITIONS.find((o) => o.objective === objective);
  return found ? found.icon : '🎖️';
}

export function renderStrategicMenu(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const player = findPlayerEntity(gameState);
  if (!player || player.leaderId !== player.id) {
    return; // Only tribe leaders can see this menu
  }

  const leader = gameState.entities.entities[player.leaderId] as HumanEntity | undefined;
  if (!leader) return;

  const currentObjective = leader.tribeControl?.strategicObjective || StrategicObjective.None;

  const rowHeight = UI_BUTTON_HEIGHT + 4;
  const rowSpacing = 2;
  const headerHeight = Math.round(UI_FONT_SIZE * 1.5);
  const panelPadding = UI_PADDING;

  const contentHeight = headerHeight + STRATEGIC_OBJECTIVE_DEFINITIONS.length * (rowHeight + rowSpacing) + panelPadding;
  const panelWidth = 280;
  const panelHeight = contentHeight + panelPadding;

  const buttonBarY = canvasHeight - UI_AUTOPILOT_BUTTON_SIZE - 20;
  const panelBottom = buttonBarY - 10;
  const panelX = Math.max(UI_PADDING, Math.floor((canvasWidth - panelWidth) / 2));
  const panelY = Math.max(UI_PADDING, Math.floor(panelBottom - panelHeight));

  ctx.save();

  // Panel background
  ctx.fillStyle = '#2d3748'; // UI_BUTTON_BACKGROUND_COLOR equivalent with higher opacity
  ctx.globalAlpha = 0.95;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.globalAlpha = 1;

  // Panel border
  ctx.strokeStyle = UI_BUTTON_ACTIVE_BACKGROUND_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  let cursorY = panelY + panelPadding;

  // Header
  ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
  ctx.font = `${Math.round(UI_FONT_SIZE * 0.7)}px "Press Start 2P", Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('STRATEGIC COMMAND', panelX + panelPadding, cursorY);
  cursorY += headerHeight;

  // Render objectives list
  STRATEGIC_OBJECTIVE_DEFINITIONS.forEach((objDef) => {
    const isSelected = currentObjective === objDef.objective;
    const rowX = panelX + panelPadding;
    const rowY = cursorY;
    const rowWidth = panelWidth - panelPadding * 2;

    const buttonId = `strategic_objective_${objDef.objective}`;
    const isHovered = gameState.hoveredButtonId === buttonId;

    // Row background if hovered (subtle)
    if (isHovered && !isSelected) {
      ctx.fillStyle = UI_BUTTON_HOVER_BACKGROUND_COLOR;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(rowX, rowY, rowWidth, rowHeight);
      ctx.globalAlpha = 1.0;
    }

    // Row background if selected
    if (isSelected) {
      ctx.fillStyle = UI_BUTTON_ACTIVE_BACKGROUND_COLOR;
      ctx.fillRect(rowX, rowY, rowWidth, rowHeight);
      ctx.strokeStyle = UI_BUTTON_ACTIVATED_BORDER_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(rowX, rowY, rowWidth, rowHeight);
    }

    // Icon and Name
    ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
    ctx.font = `${Math.round(UI_FONT_SIZE * 0.6)}px "Press Start 2P", Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${objDef.icon} ${objDef.name}`, rowX + 10, rowY + rowHeight / 2);

    // Checkmark if selected
    if (isSelected) {
      ctx.textAlign = 'right';
      ctx.fillText('✓', rowX + rowWidth - 10, rowY + rowHeight / 2);
    }

    // Register UI button for interaction
    gameState.uiButtons.push({
      id: buttonId,
      action: UIButtonActionType.SelectStrategicObjective,
      rect: { x: rowX, y: rowY, width: rowWidth, height: rowHeight },
      text: '',
      backgroundColor: 'transparent',
      textColor: UI_BUTTON_TEXT_COLOR,
      currentWidth: rowWidth,
      objective: objDef.objective,
      tooltip: objDef.tooltip,
      fixedTooltipY: panelY - 10,
    });

    cursorY += rowHeight + rowSpacing;
  });

  ctx.restore();
}
