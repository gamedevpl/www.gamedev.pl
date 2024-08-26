import { GameState, Position, Obstacle, LevelConfig } from '../gameplay-types';
import { toIsometric } from './isometric-utils';

const IMPULSE_DURATION = 1000;
const MAX_IMPULSE_LENGTH = 13;
const IMPULSE_TAIL_LENGTH = 3;

export function drawPurpleImpulse(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  { gridSize }: Pick<LevelConfig, 'gridSize'>,
) {
  const { player, obstacles } = gameState;
  const timeSinceLastMove = Date.now() - player.moveTimestamp;

  if (timeSinceLastMove > IMPULSE_DURATION) return;

  const impulsePaths = calculateImpulsePaths(player.position, obstacles, gridSize);

  ctx.save();
  ctx.strokeStyle = '#800080';
  ctx.lineWidth = 2;

  impulsePaths.forEach((path) => {
    const progress = Math.min(timeSinceLastMove / IMPULSE_DURATION, 1);
    const visibleLength = Math.floor(path.length * progress);

    ctx.beginPath();
    for (let i = Math.max(visibleLength - IMPULSE_TAIL_LENGTH, 0); i < visibleLength; i++) {
      const { x: isoX, y: isoY } = toIsometric(path[i].x + 0.5, path[i].y + 0.5);

      if (i === 0) {
        ctx.moveTo(isoX, isoY);
      } else {
        ctx.lineTo(isoX, isoY);
      }

      ctx.globalAlpha = 1 - i / visibleLength;
    }
    ctx.stroke();
  });

  ctx.restore();
}

function calculateImpulsePaths(startPosition: Position, obstacles: Obstacle[], gridSize: number): Position[][] {
  const impulsePaths: Position[][] = [];
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

    if (path.length > MAX_IMPULSE_LENGTH || isObstacleAt(currentPosition, obstacles)) {
      impulsePaths.push(path);
    } else {
      for (const direction of directions) {
        const nextPosition = {
          x: currentPosition.x + direction.x,
          y: currentPosition.y + direction.y,
        };

        if (isValidPosition(nextPosition, gridSize)) {
          const key = `${nextPosition.x},${nextPosition.y}`;
          if (!visited.has(key)) {
            visited.add(key);
            const newPath = [...path, nextPosition];
            queue.push({ position: nextPosition, path: newPath });

            if (newPath.length === MAX_IMPULSE_LENGTH) {
              impulsePaths.push(newPath);
            }
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

function isValidPosition(position: Position, gridSize: number): boolean {
  return position.x >= 0 && position.y >= 0 && position.x < gridSize && position.y < gridSize;
}