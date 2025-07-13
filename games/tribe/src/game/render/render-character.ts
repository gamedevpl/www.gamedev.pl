import { HumanEntity } from '../entities/characters/human/human-types';
import {
  PLAYER_CHILD_HIGHLIGHT_COLOR,
  PLAYER_HEIR_HIGHLIGHT_COLOR,
  PLAYER_HIGHLIGHT_COLOR,
  PLAYER_CROWN_SIZE,
  PLAYER_HEIR_CROWN_SIZE,
  PLAYER_CHILD_CROWN_SIZE,
  PLAYER_PARENT_CROWN_SIZE,
  PLAYER_PARENT_HIGHLIGHT_COLOR,
  PLAYER_PARTNER_CROWN_SIZE,
  PLAYER_PARTNER_HIGHLIGHT_COLOR,
  CHARACTER_RADIUS,
  NON_FAMILY_CLAIM_COLOR,
  UI_ATTACK_PROGRESS_BAR_WIDTH,
  UI_ATTACK_PROGRESS_BAR_HEIGHT,
  UI_ATTACK_PROGRESS_BAR_Y_OFFSET,
  UI_ATTACK_BUILDUP_BAR_COLOR,
  UI_BAR_BACKGROUND_COLOR,
  HUMAN_ATTACK_BUILDUP_HOURS,
  UI_ATTACK_COOLDOWN_BAR_COLOR,
  HUMAN_ATTACK_COOLDOWN_HOURS,
  TRIBE_BADGE_SIZE,
} from '../world-consts';
import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';
import { AIType } from '../ai/ai-types.ts';
import { HUMAN_ATTACKING, HumanAttackingStateData } from '../entities/characters/human/states/human-state-types';
import { drawProgressBar } from './render-ui';

type Stance = 'idle' | 'walk' | 'eat' | 'gathering' | 'procreate' | 'dead' | 'attacking' | 'planting';

// Mapping from HumanEntity activeAction to render stance
const actionToStanceMap: Record<NonNullable<HumanEntity['activeAction']>, Stance> = {
  moving: 'walk',
  gathering: 'gathering',
  eating: 'eat',
  procreating: 'procreate',
  idle: 'idle',
  seekingFood: 'idle',
  attacking: 'attacking',
  planting: 'gathering', // Use gathering stance for planting for now
  callingToAttack: 'idle',
};

/**
 * Renders debug information for a human character.
 * @param ctx Canvas rendering context
 * @param human The human entity to render debug info for
 */
function renderDebugInfo(ctx: CanvasRenderingContext2D, human: HumanEntity): void {
  const { radius, position, activeAction = 'idle' } = human;
  const stateName = human.stateMachine?.[0] || 'N/A';
  const yOffset = human.isAdult ? CHARACTER_RADIUS + 20 : CHARACTER_RADIUS * 0.6 + 20;

  ctx.save();
  ctx.fillStyle = 'white';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Action: ${activeAction}`, position.x, position.y - yOffset);
  ctx.fillText(`State: ${stateName}`, position.x, position.y - yOffset + 10);
  ctx.fillText(`HP: ${human.hitpoints}`, position.x, position.y - yOffset + 20);
  ctx.fillText(`Cooldown: ${human.attackCooldown || 'N/A'}`, position.x, position.y - yOffset + 30);
  ctx.restore();

  // render character radius
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.closePath();
}

function drawTribeBadge(ctx: CanvasRenderingContext2D, position: { x: number; y: number }, badge: string): void {
  ctx.save();
  ctx.font = `${TRIBE_BADGE_SIZE}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, position.x, position.y - CHARACTER_RADIUS - TRIBE_BADGE_SIZE - 18);
  ctx.restore();
}

/**
 * Draws a crown above the character
 * @param ctx Canvas rendering context
 * @param position Character position
 * @param radius Character radius
 * @param size Size of the crown
 * @param color Color of the crown
 */
function drawCrown(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  radius: number,
  size: number,
  color: string,
): void {
  const x = position.x;
  const y = position.y - radius - size / 2;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  // Draw crown base
  ctx.beginPath();
  ctx.rect(x - size / 2, y, size, size / 2);
  ctx.fill();

  // Draw crown points
  ctx.beginPath();
  // Left point
  ctx.moveTo(x - size / 2, y);
  ctx.lineTo(x - size / 4, y - size / 3);
  ctx.lineTo(x - size / 6, y);

  // Middle point
  ctx.moveTo(x - size / 6, y);
  ctx.lineTo(x, y - size / 2);
  ctx.lineTo(x + size / 6, y);

  // Right point
  ctx.moveTo(x + size / 6, y);
  ctx.lineTo(x + size / 4, y - size / 3);
  ctx.lineTo(x + size / 2, y);

  ctx.stroke();
  ctx.restore();
}

function renderAttackProgress(ctx: CanvasRenderingContext2D, human: HumanEntity, currentTime: number) {
  const { position, radius } = human;
  const barX = position.x - UI_ATTACK_PROGRESS_BAR_WIDTH / 2;
  const barY = position.y - radius - UI_ATTACK_PROGRESS_BAR_Y_OFFSET;

  // Render attack buildup
  if (human.stateMachine?.[0] === HUMAN_ATTACKING) {
    const attackData = human.stateMachine[1] as HumanAttackingStateData;
    const timeSinceAttackStart = currentTime - attackData.attackStartTime;
    const buildupProgress = Math.min(timeSinceAttackStart / HUMAN_ATTACK_BUILDUP_HOURS, 1);

    drawProgressBar(
      ctx,
      barX,
      barY,
      UI_ATTACK_PROGRESS_BAR_WIDTH,
      UI_ATTACK_PROGRESS_BAR_HEIGHT,
      buildupProgress,
      UI_BAR_BACKGROUND_COLOR,
      UI_ATTACK_BUILDUP_BAR_COLOR,
    );
  }
  // Render attack cooldown
  else if (human.attackCooldown && human.attackCooldown > 0) {
    const cooldownProgress = 1 - human.attackCooldown / HUMAN_ATTACK_COOLDOWN_HOURS;
    drawProgressBar(
      ctx,
      barX,
      barY,
      UI_ATTACK_PROGRESS_BAR_WIDTH,
      UI_ATTACK_PROGRESS_BAR_HEIGHT,
      cooldownProgress,
      UI_BAR_BACKGROUND_COLOR,
      UI_ATTACK_COOLDOWN_BAR_COLOR,
    );
  }
}

/**
 * Renders a human character on the canvas
 * @param ctx Canvas rendering context
 * @param human The human entity to render
 */
export function renderCharacter(
  ctx: CanvasRenderingContext2D,
  human: HumanEntity,
  isPlayer: boolean = false,
  isPlayerParent: boolean = false,
  isPlayerChild: boolean = false,
  isPlayerPartner: boolean = false,
  isPlayerHeir: boolean = false,
  isPlayerAttackTarget: boolean = false,
  isDebugOn: boolean = false,
  currentTime: number,
): void {
  const { position, activeAction = 'idle' } = human;

  // Adjust character radius based on adult status
  const currentCharacterRadius = human.isAdult ? CHARACTER_RADIUS : CHARACTER_RADIUS * 0.6;

  const stance: Stance = actionToStanceMap[activeAction] || 'idle';

  TribeHuman2D.render(
    ctx,
    position.x - currentCharacterRadius,
    position.y - currentCharacterRadius,
    currentCharacterRadius * 2,
    currentCharacterRadius * 2,
    human.animationProgress || 0,
    stance,
    human.gender,
    human.age,
    [human.direction.x, human.direction.y],
    human.isPregnant ?? false,
    human.hunger,
  );

  // Draw attack target highlight
  if (isPlayerAttackTarget) {
    ctx.save();
    ctx.strokeStyle = NON_FAMILY_CLAIM_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(position.x, position.y, currentCharacterRadius + 3, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // Draw crowns for highlighted characters
  let crownSize: number | undefined;
  let highlightColor: string | undefined;

  if (isPlayerHeir) {
    crownSize = PLAYER_HEIR_CROWN_SIZE;
    highlightColor = PLAYER_HEIR_HIGHLIGHT_COLOR;
  } else if (isPlayer) {
    crownSize = PLAYER_CROWN_SIZE;
    highlightColor = PLAYER_HIGHLIGHT_COLOR;
  } else if (isPlayerChild) {
    crownSize = PLAYER_CHILD_CROWN_SIZE;
    highlightColor = PLAYER_CHILD_HIGHLIGHT_COLOR;
  } else if (isPlayerParent) {
    crownSize = PLAYER_PARENT_CROWN_SIZE;
    highlightColor = PLAYER_PARENT_HIGHLIGHT_COLOR;
  } else if (isPlayerPartner) {
    crownSize = PLAYER_PARTNER_CROWN_SIZE; // Partners also get a crown
    highlightColor = PLAYER_PARTNER_HIGHLIGHT_COLOR;
  }

  if (crownSize && highlightColor) {
    drawCrown(ctx, position, currentCharacterRadius, crownSize, highlightColor);
  }

  if (human.tribeBadge) {
    drawTribeBadge(ctx, position, human.tribeBadge);
  }

  // Render AI Type indicator for A/B/C testing
  if (human.aiType !== undefined) {
    ctx.save();
    const indicatorRadius = 3;
    const indicatorYOffset = currentCharacterRadius + 5;
    let indicatorColor: string;
    switch (human.aiType) {
      case AIType.UtilityBased:
        indicatorColor = 'blue';
        break;
      case AIType.BehaviorTreeBased:
        indicatorColor = 'purple';
        break;
      case AIType.StrategyBased:
      default:
        indicatorColor = 'red';
        break;
    }
    ctx.fillStyle = indicatorColor;
    ctx.beginPath();
    ctx.arc(position.x, position.y - indicatorYOffset, indicatorRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  renderAttackProgress(ctx, human, currentTime);

  if (isDebugOn) {
    renderDebugInfo(ctx, human);
  }
}
