import { GameWorldState } from '../../world-types';
import { StrategicObjective } from '../../entities/tribe/tribe-types';
import { UIButtonActionType } from '../../ui/ui-types';
import { findPlayerEntity, findTribeMembers } from '../../utils/world-utils';
import { HumanEntity } from '../../entities/characters/human/human-types';

const PANEL_WIDTH = 350;
const PANEL_PADDING = 20;
const PANEL_BACKGROUND = '#2d3748';
const PANEL_BORDER = '#4a5568';
const TEXT_COLOR = '#e2e8f0';
const TEXT_COLOR_DIM = '#a0aec0';
const HIGHLIGHT_COLOR = '#4299e1';
const CATEGORY_COLOR = '#718096';
const RADIO_SIZE = 12;
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 50;
const FOOTER_HEIGHT = 60;

interface ObjectiveDefinition {
  objective: StrategicObjective;
  icon: string;
  name: string;
}

interface CategoryDefinition {
  name: string;
  icon: string;
  objectives: ObjectiveDefinition[];
}

const OBJECTIVE_CATEGORIES: CategoryDefinition[] = [
  {
    name: 'ECONOMIC & RESOURCE',
    icon: '🌾',
    objectives: [
      { objective: StrategicObjective.GreatHarvest, icon: '🌾', name: 'THE GREAT HARVEST' },
      { objective: StrategicObjective.GreenThumb, icon: '🌱', name: 'GREEN THUMB' },
      { objective: StrategicObjective.LumberjackFever, icon: '🪓', name: 'LUMBERJACK FEVER' },
      { objective: StrategicObjective.WinterPrep, icon: '🔥', name: 'WINTER PREP' },
    ],
  },
  {
    name: 'GROWTH & INFRASTRUCTURE',
    icon: '🏗️',
    objectives: [
      { objective: StrategicObjective.BabyBoom, icon: '👶', name: 'BABY BOOM' },
      { objective: StrategicObjective.ManifestDestiny, icon: '🗺️', name: 'MANIFEST DESTINY' },
      { objective: StrategicObjective.IronCurtain, icon: '🧱', name: 'THE IRON CURTAIN' },
    ],
  },
  {
    name: 'MILITARY & DIPLOMACY',
    icon: '⚔️',
    objectives: [
      { objective: StrategicObjective.Warpath, icon: '⚔️', name: 'WARPATH' },
      { objective: StrategicObjective.ActiveDefense, icon: '🛡️', name: 'ACTIVE DEFENSE' },
      { objective: StrategicObjective.RaidingParty, icon: '🗡️', name: 'RAIDING PARTY' },
    ],
  },
];

function getObjectiveName(objective: StrategicObjective): string {
  for (const category of OBJECTIVE_CATEGORIES) {
    const found = category.objectives.find((o) => o.objective === objective);
    if (found) return found.name;
  }
  return 'NONE';
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
  const tribeMembers = findTribeMembers(player.leaderId, gameState);
  const population = tribeMembers.length;

  // Calculate panel dimensions
  const panelX = canvasWidth - PANEL_WIDTH - 20;
  const panelY = 60;
  const panelHeight = canvasHeight - 120;

  ctx.save();

  // Draw panel background
  ctx.fillStyle = PANEL_BACKGROUND;
  ctx.globalAlpha = 0.95;
  ctx.fillRect(panelX, panelY, PANEL_WIDTH, panelHeight);
  ctx.globalAlpha = 1;

  // Draw panel border
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, PANEL_WIDTH, panelHeight);

  // Draw header
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '10px "Press Start 2P", Arial';
  ctx.textAlign = 'center';
  ctx.fillText('STRATEGIC COMMANDS', panelX + PANEL_WIDTH / 2, panelY + 25);

  // Draw current objective display
  const currentObjY = panelY + HEADER_HEIGHT;
  ctx.fillStyle = '#1a202c';
  ctx.fillRect(panelX + PANEL_PADDING, currentObjY, PANEL_WIDTH - PANEL_PADDING * 2, 40);
  ctx.strokeStyle = PANEL_BORDER;
  ctx.strokeRect(panelX + PANEL_PADDING, currentObjY, PANEL_WIDTH - PANEL_PADDING * 2, 40);

  ctx.fillStyle = TEXT_COLOR_DIM;
  ctx.font = '7px "Press Start 2P", Arial';
  ctx.textAlign = 'left';
  ctx.fillText('CURRENT OBJECTIVE:', panelX + PANEL_PADDING + 10, currentObjY + 15);

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '8px "Press Start 2P", Arial';
  const currentObjName = currentObjective === StrategicObjective.None ? 'NONE' : getObjectiveName(currentObjective);
  ctx.fillText(currentObjName, panelX + PANEL_PADDING + 10, currentObjY + 30);

  // Draw dropdown indicator
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '8px "Press Start 2P", Arial';
  ctx.textAlign = 'right';
  ctx.fillText('▼', panelX + PANEL_WIDTH - PANEL_PADDING - 10, currentObjY + 25);

  // Draw categories and objectives
  let yOffset = currentObjY + 60;

  // Add "None" option at the top
  const noneRowY = yOffset;
  const isNoneSelected = currentObjective === StrategicObjective.None;

  // Highlight if selected
  if (isNoneSelected) {
    ctx.fillStyle = HIGHLIGHT_COLOR;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(panelX + PANEL_PADDING, noneRowY - 5, PANEL_WIDTH - PANEL_PADDING * 2, ROW_HEIGHT);
    ctx.globalAlpha = 1;
  }

  // Radio button for None
  const noneRadioX = panelX + PANEL_PADDING + 15;
  const noneRadioY = noneRowY + ROW_HEIGHT / 2 - 5;
  ctx.strokeStyle = TEXT_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(noneRadioX, noneRadioY, RADIO_SIZE / 2, 0, Math.PI * 2);
  ctx.stroke();

  if (isNoneSelected) {
    ctx.fillStyle = HIGHLIGHT_COLOR;
    ctx.beginPath();
    ctx.arc(noneRadioX, noneRadioY, RADIO_SIZE / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // None label
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '8px "Press Start 2P", Arial';
  ctx.textAlign = 'left';
  ctx.fillText('⭕ NONE', noneRadioX + 15, noneRowY + ROW_HEIGHT / 2);

  // Add clickable button for None
  gameState.uiButtons.push({
    id: 'strategic_objective_none',
    action: UIButtonActionType.SelectStrategicObjective,
    rect: {
      x: panelX + PANEL_PADDING,
      y: noneRowY - 5,
      width: PANEL_WIDTH - PANEL_PADDING * 2,
      height: ROW_HEIGHT,
    },
    text: '',
    backgroundColor: 'transparent',
    textColor: TEXT_COLOR,
    currentWidth: PANEL_WIDTH - PANEL_PADDING * 2,
    objective: StrategicObjective.None,
  });

  yOffset += ROW_HEIGHT + 10;

  // Draw categories
  for (const category of OBJECTIVE_CATEGORIES) {
    // Category header
    ctx.fillStyle = CATEGORY_COLOR;
    ctx.font = '7px "Press Start 2P", Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${category.icon} ${category.name}`, panelX + PANEL_PADDING + 10, yOffset);
    yOffset += 20;

    // Draw objectives in this category
    for (const objDef of category.objectives) {
      const isSelected = currentObjective === objDef.objective;
      const rowY = yOffset;

      // Highlight if selected
      if (isSelected) {
        ctx.fillStyle = HIGHLIGHT_COLOR;
        ctx.globalAlpha = 0.2;
        ctx.fillRect(panelX + PANEL_PADDING, rowY - 5, PANEL_WIDTH - PANEL_PADDING * 2, ROW_HEIGHT);
        ctx.globalAlpha = 1;
      }

      // Radio button
      const radioX = panelX + PANEL_PADDING + 15;
      const radioY = rowY + ROW_HEIGHT / 2 - 5;
      ctx.strokeStyle = TEXT_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(radioX, radioY, RADIO_SIZE / 2, 0, Math.PI * 2);
      ctx.stroke();

      if (isSelected) {
        ctx.fillStyle = HIGHLIGHT_COLOR;
        ctx.beginPath();
        ctx.arc(radioX, radioY, RADIO_SIZE / 2 - 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Objective icon and name
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '8px "Press Start 2P", Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`${objDef.icon} ${objDef.name}`, radioX + 15, rowY + ROW_HEIGHT / 2);

      // Add clickable button
      gameState.uiButtons.push({
        id: `strategic_objective_${objDef.objective}`,
        action: UIButtonActionType.SelectStrategicObjective,
        rect: {
          x: panelX + PANEL_PADDING,
          y: rowY - 5,
          width: PANEL_WIDTH - PANEL_PADDING * 2,
          height: ROW_HEIGHT,
        },
        text: '',
        backgroundColor: 'transparent',
        textColor: TEXT_COLOR,
        currentWidth: PANEL_WIDTH - PANEL_PADDING * 2,
        objective: objDef.objective,
      });

      yOffset += ROW_HEIGHT;
    }

    yOffset += 15; // Space between categories
  }

  // Draw footer
  const footerY = panelY + panelHeight - FOOTER_HEIGHT;
  ctx.fillStyle = '#1a202c';
  ctx.fillRect(panelX + PANEL_PADDING, footerY, PANEL_WIDTH - PANEL_PADDING * 2, FOOTER_HEIGHT - 10);
  ctx.strokeStyle = PANEL_BORDER;
  ctx.strokeRect(panelX + PANEL_PADDING, footerY, PANEL_WIDTH - PANEL_PADDING * 2, FOOTER_HEIGHT - 10);

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '7px "Press Start 2P", Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`POPULATION: ${population} (↑ ↓)`, panelX + PANEL_PADDING + 10, footerY + 20);
  ctx.fillText(`MORALE: 80%`, panelX + PANEL_PADDING + 10, footerY + 35);

  ctx.restore();
}
