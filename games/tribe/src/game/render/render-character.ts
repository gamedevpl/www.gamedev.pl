import { HumanEntity } from '../entities/characters/human/human-types';
import {
  PLAYER_CHILD_HIGHLIGHT_COLOR,
  PLAYER_HEIR_HIGHLIGHT_COLOR,
  PLAYER_HIGHLIGHT_COLOR,
  PLAYER_CROWN_SIZE,
  PLAYER_HEIR_CROWN_SIZE,
  PLAYER_CHILD_CROWN_SIZE,
} from '../world-consts';

import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';

const CHARACTER_RADIUS = 30;

type Stance = 'idle' | 'walk' | 'eat' | 'gathering' | 'procreate' | 'dead';

// Mapping from HumanEntity activeAction to render stance
const actionToStanceMap: Record<NonNullable<HumanEntity['activeAction']>, Stance> = {
  moving: 'walk',
  gathering: 'gathering',
  eating: 'eat',
  procreating: 'procreate',
  idle: 'idle',
  seekingFood: 'idle',
  attacking: 'procreate', // Placeholder stance
  stunned: 'dead', // Placeholder stance
};

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

/**
 * Renders a human character on the canvas
 * @param ctx Canvas rendering context
 * @param human The human entity to render
 */
export function renderCharacter(
  ctx: CanvasRenderingContext2D,
  human: HumanEntity,
  isPlayer: boolean = false,
  isPlayerChild: boolean = false,
  isPlayerHeir: boolean = false,
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
  }

  if (crownSize && highlightColor) {
    drawCrown(ctx, position, currentCharacterRadius, crownSize, highlightColor);
  }
}
