import { TILE_HEIGHT } from './isometric-utils';
import { calculateEntityDimensions, EntityRenderParams } from './entity-render-utils';
import { calculateBounceOffset, calculateConfusedShake } from './animation-utils';

export const drawEntityBody = (
  ctx: CanvasRenderingContext2D,
  isoX: number,
  isoY: number,
  entityHeight: number,
  entityWidth: number,
  color: string,
  bounceOffset: number,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(isoX, isoY - entityHeight - bounceOffset);
  ctx.lineTo(isoX + entityWidth / 2, isoY - entityHeight + TILE_HEIGHT / 4 - bounceOffset);
  ctx.lineTo(isoX, isoY + TILE_HEIGHT / 2 - bounceOffset);
  ctx.lineTo(isoX - entityWidth / 2, isoY - entityHeight + TILE_HEIGHT / 4 - bounceOffset);
  ctx.closePath();
  ctx.fill();
};

export const drawEntityHead = (
  ctx: CanvasRenderingContext2D,
  isoX: number,
  isoY: number,
  entityHeight: number,
  headRadius: number,
  color: string,
  bounceOffset: number,
) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(isoX, isoY - entityHeight - headRadius / 2 - bounceOffset, headRadius, 0, Math.PI * 2);
  ctx.fill();
};

export const drawEntityEyes = (
  ctx: CanvasRenderingContext2D,
  isoX: number,
  isoY: number,
  entityHeight: number,
  headRadius: number,
  eyeColor: string,
  pupilColor: string,
  bounceOffset: number,
) => {
  const eyeRadius = headRadius * 0.3;
  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.arc(isoX - headRadius / 3, isoY - entityHeight - headRadius / 2 - bounceOffset, eyeRadius, 0, Math.PI * 2);
  ctx.arc(isoX + headRadius / 3, isoY - entityHeight - headRadius / 2 - bounceOffset, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = pupilColor;
  ctx.beginPath();
  ctx.arc(isoX - headRadius / 3, isoY - entityHeight - headRadius / 2 - bounceOffset, eyeRadius / 2, 0, Math.PI * 2);
  ctx.arc(isoX + headRadius / 3, isoY - entityHeight - headRadius / 2 - bounceOffset, eyeRadius / 2, 0, Math.PI * 2);
  ctx.fill();
};

export const drawEntityMouth = (
  ctx: CanvasRenderingContext2D,
  isoX: number,
  isoY: number,
  entityHeight: number,
  headRadius: number,
  bounceOffset: number,
) => {
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(isoX, isoY - entityHeight + headRadius / 4 - bounceOffset, headRadius / 2, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
};

export const drawEntityTentacles = (
  ctx: CanvasRenderingContext2D,
  isoX: number,
  isoY: number,
  entityHeight: number,
  entityWidth: number,
  cellSize: number,
  tentacleCount: number,
  tentacleLength: number,
  tentacleWidth: number,
  color: string,
  animFactor: number,
  seed: number,
  castShadow: boolean,
  bounceOffset: number,
) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = tentacleWidth;

  const randomOffset = Math.sin(seed * 1000) * Math.PI;

  for (let i = 0; i < tentacleCount; i++) {
    const angle = (i / tentacleCount) * Math.PI * 2;
    const startX = isoX + Math.cos(angle) * (entityWidth / 3);
    const startY = isoY - entityHeight / 2 + Math.sin(angle) * (entityHeight / 4) - bounceOffset;

    const waveFrequency = 2 + Math.sin(seed * 100 + i) * 2;
    const waveAmplitude = 0.1 + Math.cos(seed * 200 + i) * 0.05;

    const controlPoint1X = startX + Math.cos(angle) * (tentacleLength / 2);
    const controlPoint1Y =
      startY +
      Math.sin(angle) * (tentacleLength / 2) +
      Math.sin(animFactor * waveFrequency + randomOffset + i) * cellSize * waveAmplitude;

    const controlPoint2X = startX + Math.cos(angle) * tentacleLength;
    const controlPoint2Y =
      startY +
      Math.sin(angle) * tentacleLength +
      Math.sin(animFactor * waveFrequency + Math.PI + randomOffset + i) * cellSize * (waveAmplitude * 1.5);

    const endX = startX + Math.cos(angle) * tentacleLength;
    const endY =
      startY +
      Math.sin(angle) * tentacleLength +
      Math.sin(animFactor * waveFrequency + randomOffset + i) * cellSize * (waveAmplitude * 2);

    // Draw shadow for tentacles
    if (castShadow) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = tentacleWidth * 1.5;
      ctx.beginPath();
      ctx.moveTo(startX, startY + TILE_HEIGHT / 2);
      ctx.bezierCurveTo(
        controlPoint1X,
        controlPoint1Y + TILE_HEIGHT / 2,
        controlPoint2X,
        controlPoint2Y + TILE_HEIGHT / 2,
        endX,
        endY + TILE_HEIGHT / 2,
      );
      ctx.stroke();
      ctx.restore();
    }

    // Draw tentacle
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(controlPoint1X, controlPoint1Y, controlPoint2X, controlPoint2Y, endX, endY);
    ctx.stroke();
  }
};

export const renderEntity = (params: EntityRenderParams): { bounceOffset: number } => {
  const {
    ctx,
    isoX,
    isoY,
    cellSize,
    baseHeight,
    widthFactor,
    heightAnimationFactor,
    bodyColor,
    headColor,
    eyeColor,
    pupilColor,
    hasTentacles = false,
    tentacleColor = '',
    tentacleCount = 0,
    tentacleLength = 0,
    tentacleWidth = 0,
    isInvisible = false,
    seed = 0,
    castShadow = true,
    isConfused = false,
  } = params;

  const dimensions = calculateEntityDimensions({
    isoX,
    isoY,
    cellSize,
    baseHeight,
    widthFactor,
    heightAnimationFactor,
  });

  const { entityHeight, entityWidth, shadowWidth, shadowHeight, animFactor, shadowX, shadowY } = dimensions;

  // Calculate bounce offset
  const bounceOffset = calculateBounceOffset(seed);

  // Calculate confused shake if applicable
  const confusedShake = isConfused ? calculateConfusedShake() : { x: 0, y: 0 };

  // Interpolate position for smooth movement
  let renderX = isoX;
  let renderY = isoY;

  // Apply confused shake
  renderX += confusedShake.x;
  renderY += confusedShake.y;

  // Draw shadow
  if (castShadow) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(shadowX + shadowWidth / 2, shadowY, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  if (isInvisible) {
    ctx.globalAlpha = 0.5;
  }

  // Draw tentacles if needed (before body to appear behind it)
  if (hasTentacles && tentacleColor && tentacleCount > 0) {
    drawEntityTentacles(
      ctx,
      renderX,
      renderY,
      entityHeight,
      entityWidth,
      cellSize,
      tentacleCount,
      tentacleLength,
      tentacleWidth,
      tentacleColor,
      animFactor,
      seed,
      castShadow,
      bounceOffset,
    );
  }

  // Draw body
  drawEntityBody(ctx, renderX, renderY, entityHeight, entityWidth, bodyColor, bounceOffset);

  // Draw head
  const headRadius = cellSize * 0.25;
  drawEntityHead(ctx, renderX, renderY, entityHeight, headRadius, headColor, bounceOffset);

  // Draw eyes
  drawEntityEyes(ctx, renderX, renderY, entityHeight, headRadius, eyeColor, pupilColor, bounceOffset);

  // Draw mouth
  drawEntityMouth(ctx, renderX, renderY, entityHeight, headRadius, bounceOffset);

  ctx.restore();

  return { bounceOffset };
};
