import { AnimationParams, calculateAnimationFactor, calculateShadowSizeFactor } from './animation-utils';
import { TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';

export const calculateEntityDimensions = (params: AnimationParams) => {
  const { isoX, isoY, cellSize, baseHeight, widthFactor, heightAnimationFactor } = params;
  const animFactor = calculateAnimationFactor();
  const entityHeight = baseHeight * cellSize + cellSize * heightAnimationFactor * animFactor;
  const entityWidth = TILE_WIDTH * widthFactor;

  const shadowSizeFactor = calculateShadowSizeFactor(animFactor);
  const shadowWidth = TILE_WIDTH * widthFactor * shadowSizeFactor;
  const shadowHeight = TILE_HEIGHT * 0.4 * shadowSizeFactor;

  return {
    entityHeight,
    entityWidth,
    shadowWidth,
    shadowHeight,
    animFactor,
    shadowX: isoX - shadowWidth / 2,
    shadowY: isoY + TILE_HEIGHT / 2,
  };
};

export interface EntityRenderParams {
  ctx: CanvasRenderingContext2D;
  isoX: number;
  isoY: number;
  cellSize: number;
  baseHeight: number;
  widthFactor: number;
  heightAnimationFactor: number;
  bodyColor: string;
  headColor: string;
  eyeColor: string;
  pupilColor: string;
  hasTentacles?: boolean;
  tentacleColor?: string;
  tentacleCount?: number;
  tentacleLength?: number;
  tentacleWidth?: number;
  isInvisible?: boolean;
  seed?: number;
  castShadow?: boolean;
  isConfused?: boolean;
}
