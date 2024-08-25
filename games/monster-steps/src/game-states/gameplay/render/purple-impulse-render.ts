import { GameState, Position, Obstacle, LevelConfig } from '../gameplay-types';
import { toIsometric } from './isometric-utils';

const IMPULSE_DURATION = 1000; // 1 second duration
const MAX_IMPULSE_LENGTH = 13; // Maximum length of the impulse in cells
const IMPULSE_TAIL_LENGTH = 3;

interface ImpulsePath {
  path: Position[];
  startTime: number;
}

export function drawPurpleImpulse(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  { gridSize }: Pick<LevelConfig, 'gridSize'>,
) {
  const { player, obstacles } = gameState;
  const currentTime = Date.now();
  const timeSinceLastMove = currentTime - player.moveTimestamp;

  if (timeSinceLastMove > IMPULSE_DURATION) {
    return; // Don't draw if more than 1 second has passed since the last move
  }

  const impulsePaths = calculateImpulsePaths(player.position, obstacles, MAX_IMPULSE_LENGTH);

  ctx.save();
  ctx.strokeStyle = 'purple';
  ctx.lineWidth = 2;

  impulsePaths.forEach((impulsePath) => {
    const progress = Math.min(timeSinceLastMove / IMPULSE_DURATION, 1);
    const pathLength = impulsePath.path.length;
    const visibleLength = Math.floor(pathLength * progress);

    ctx.beginPath();
    for (let i = Math.max(visibleLength - IMPULSE_TAIL_LENGTH, 0); i < visibleLength; i++) {
      const position = impulsePath.path[i];

      if (position.x < 0 || position.y < 0 || position.x >= gridSize || position.y >= gridSize) {
        continue;
      }

      const { x: isoX, y: isoY } = toIsometric(position.x + 0.5, position.y + 0.5);

      if (i === 0) {
        ctx.moveTo(isoX, isoY);
      } else {
        ctx.lineTo(isoX, isoY);
      }

      // Calculate opacity based on position in the impulse (fading tail)
      const opacity = 1 - i / visibleLength;
      ctx.globalAlpha = opacity;
    }
    ctx.stroke();
  });

  ctx.restore();
}

function calculateImpulsePaths(startPosition: Position, obstacles: Obstacle[], maxLength: number): ImpulsePath[] {
  const impulsePaths: ImpulsePath[] = [];
  const visited: Set<string> = new Set();
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  const queue: { position: Position; path: Position[] }[] = [{ position: startPosition, path: [startPosition] }];
  visited.add(`${startPosition.x},${startPosition.y}`);

  while (queue.length > 0) {
    const { position: currentPosition, path } = queue.shift()!;

    if (path.length > maxLength || isObstacleAt(currentPosition, obstacles)) {
      impulsePaths.push({ path, startTime: Date.now() });
    } else {
      for (const direction of directions) {
        const nextPosition = {
          x: currentPosition.x + direction.x,
          y: currentPosition.y + direction.y,
        };

        const key = `${nextPosition.x},${nextPosition.y}`;
        if (!visited.has(key)) {
          visited.add(key);
          const newPath = [...path, nextPosition];

          queue.push({ position: nextPosition, path: newPath });

          if (newPath.length === maxLength) {
            impulsePaths.push({ path: newPath, startTime: Date.now() });
          }
        }
      }
    }
  }

  return impulsePaths;
}

function isObstacleAt(position: Position, obstacles: Obstacle[]): boolean {
  return obstacles.some((obstacle) => obstacle.position.x === position.x && obstacle.position.y === position.y);
}
