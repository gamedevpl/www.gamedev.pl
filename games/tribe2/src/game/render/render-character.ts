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
  UI_ATTACK_COOLDOWN_BAR_COLOR,
  TRIBE_BADGE_SIZE,
  CHARACTER_CHILD_RADIUS,
} from '../ui/ui-consts.js';
import { HUMAN_ATTACK_MELEE_BUILDUP_HOURS, HUMAN_ATTACK_MELEE_COOLDOWN_HOURS } from '../human-consts';
import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';
import { HUMAN_ATTACKING, HumanAttackingStateData } from '../entities/characters/human/states/human-state-types';
import { drawProgressBar } from './render-ui';
import { GameWorldState } from '../world-types.js';
import { getDirectionVectorOnTorus } from '../utils/math-utils';
import { ITEM_TYPE_EMOJIS } from '../entities/item-types';
import { SpriteCache } from './sprite-cache';
import { snapToStep, discretizeDirection, getDiscretizedDirectionVector } from './render-utils';

type Stance = 'idle' | 'walk' | 'eat' | 'gathering' | 'procreate' | 'dead' | 'attacking' | 'planting';

// Mapping from HumanEntity activeAction to render stance
const actionToStanceMap: Record<NonNullable<HumanEntity['activeAction']>, Stance> = {
  moving: 'walk',
  gathering: 'gathering',
  eating: 'eat',
  feeding: 'eat',
  procreating: 'procreate',
  idle: 'idle',
  attacking: 'attacking',
  planting: 'gathering',
  depositing: 'gathering',
  retrieving: 'gathering',
  takingOverBuilding: 'attacking',
  destroyingBuilding: 'attacking',
  chopping: 'gathering',
};

// Caching logic
const characterCache = new SpriteCache(10000);

/**
 * Draws the character's path waypoints and target.
 */
function drawPath(ctx: CanvasRenderingContext2D, human: HumanEntity, gameState: GameWorldState): void {
  if (!human.path || human.path.length === 0) return;

  const { width, height } = gameState.mapDimensions;
  ctx.save();

  // Draw path waypoints
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;

  let currentPos = { ...human.position };

  ctx.beginPath();
  ctx.moveTo(currentPos.x, currentPos.y);

  for (const waypoint of human.path) {
    const dir = getDirectionVectorOnTorus(currentPos, waypoint, width, height);
    const nextPos = { x: currentPos.x + dir.x, y: currentPos.y + dir.y };
    ctx.lineTo(nextPos.x, nextPos.y);
    currentPos = nextPos;
  }

  // Draw to final target if it exists
  if (human.pathTarget) {
    const dir = getDirectionVectorOnTorus(currentPos, human.pathTarget, width, height);
    const nextPos = { x: currentPos.x + dir.x, y: currentPos.y + dir.y };
    ctx.lineTo(nextPos.x, nextPos.y);
    currentPos = nextPos;
  }

  ctx.stroke();

  // Draw waypoints markers
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  let p = { ...human.position };
  for (const waypoint of human.path) {
    const dir = getDirectionVectorOnTorus(p, waypoint, width, height);
    const nextP = { x: p.x + dir.x, y: p.y + dir.y };
    ctx.beginPath();
    ctx.arc(nextP.x, nextP.y, 2, 0, Math.PI * 2);
    ctx.fill();
    p = nextP;
  }

  // Draw final target marker
  if (human.pathTarget) {
    const dir = getDirectionVectorOnTorus(p, human.pathTarget, width, height);
    const finalP = { x: p.x + dir.x, y: p.y + dir.y };
    ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.beginPath();
    ctx.arc(finalP.x, finalP.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Renders debug information for a human character.
 * @param ctx Canvas rendering context
 * @param human The human entity to render debug info for
 */
function renderDebugInfo(ctx: CanvasRenderingContext2D, human: HumanEntity, gameState: GameWorldState): void {
  const { radius, position, activeAction = 'idle' } = human;
  const stateName = human.stateMachine[0] || 'N/A';
  const yOffset = human.isAdult ? CHARACTER_RADIUS + 20 : CHARACTER_RADIUS * 0.6 + 20;

  ctx.save();
  ctx.fillStyle = 'white';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Action: ${activeAction}`, position.x, position.y - yOffset);
  ctx.fillText(`State: ${stateName}`, position.x, position.y - yOffset + 10);
  ctx.fillText(`Path: ${human.path?.length || 0} waypoints`, position.x, position.y - yOffset + 50);
  ctx.fillText(`HP: ${human.hitpoints}`, position.x, position.y - yOffset + 20);
  ctx.fillText(`Cooldown: ${human.attackCooldown || 'N/A'}`, position.x, position.y - yOffset + 30);
  ctx.fillText(`Tribe: ${human.leaderId || 'N/A'}`, position.x, position.y - yOffset + 40);
  ctx.restore();

  // render character radius
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';

  if (gameState.debugCharacterId === human.id) {
    drawPath(ctx, human, gameState);
  }
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.closePath();
}

function drawTribeBadge(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  badge: string,
  isAdult: boolean,
  crownSize: number,
): void {
  ctx.save();
  ctx.font = `${TRIBE_BADGE_SIZE}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    badge,
    position.x,
    position.y - (isAdult ? CHARACTER_RADIUS : CHARACTER_CHILD_RADIUS) - TRIBE_BADGE_SIZE - crownSize,
  );
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
  if (human.stateMachine[0] === HUMAN_ATTACKING) {
    const attackData = human.stateMachine[1] as HumanAttackingStateData;
    const timeSinceAttackStart = currentTime - attackData.attackStartTime;
    const buildupProgress = Math.min(timeSinceAttackStart / HUMAN_ATTACK_MELEE_BUILDUP_HOURS, 1);

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
  else if (human.attackCooldown?.melee && human.attackCooldown.melee > 0) {
    const cooldownProgress = 1 - human.attackCooldown.melee / HUMAN_ATTACK_MELEE_COOLDOWN_HOURS;
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
  gameState: GameWorldState,
): void {
  const { position, activeAction = 'idle' } = human;

  // Adjust character radius based on adult status
  const currentCharacterRadius = human.isAdult ? CHARACTER_RADIUS : CHARACTER_RADIUS * 0.6;

  const stance: Stance = actionToStanceMap[activeAction] || 'idle';

  // Discretize state for caching
  const animStep = snapToStep(human.animationProgress || 0, 12);
  const dirStep = discretizeDirection(human.direction, 8);
  const ageStep = Math.floor(human.age);
  const hungerStep = snapToStep(human.hunger / 100, 5) * 100;

  const key = `${stance}_${human.gender}_${ageStep}_${dirStep}_${animStep}_${
    human.isPregnant ?? false
  }_${hungerStep}_${currentCharacterRadius}`;
  const size = Math.ceil(currentCharacterRadius * 2) + 4;

  const sprite = characterCache.getOrRender(key, size, size, (cacheCtx) => {
    cacheCtx.translate(size / 2, size / 2);
    const discreteDir = getDiscretizedDirectionVector(dirStep, 8);
    TribeHuman2D.render(
      cacheCtx,
      -size / 2 + 2,
      -size / 2 + 2,
      size - 4,
      size - 4,
      animStep,
      stance,
      human.gender,
      ageStep,
      discreteDir,
      human.isPregnant ?? false,
      hungerStep,
    );
  });

  ctx.drawImage(sprite, position.x - sprite.width / 2, position.y - sprite.height / 2);

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

  if (human.tribeInfo?.tribeBadge) {
    drawTribeBadge(ctx, position, human.tribeInfo.tribeBadge, human.isAdult ?? false, crownSize ?? 0);
  }

  if (human.heldItem) {
    const itemEmoji = ITEM_TYPE_EMOJIS[human.heldItem.type];
    const badgeOffset = human.tribeInfo?.tribeBadge ? TRIBE_BADGE_SIZE : 0;
    ctx.save();
    ctx.font = `${TRIBE_BADGE_SIZE}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y =
      position.y -
      (human.isAdult ? CHARACTER_RADIUS : CHARACTER_CHILD_RADIUS) -
      TRIBE_BADGE_SIZE -
      (crownSize ?? 0) -
      badgeOffset;
    ctx.fillText(itemEmoji, position.x, y);
    ctx.restore();
  }

  const showDebug = isDebugOn && (gameState.debugCharacterId === undefined || human.id === gameState.debugCharacterId);

  renderAttackProgress(ctx, human, gameState.time);

  if (showDebug) {
    renderDebugInfo(ctx, human, gameState);
  }
}
