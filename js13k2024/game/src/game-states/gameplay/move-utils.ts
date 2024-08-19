import { Direction, GameState, LevelConfig, Position } from './gameplay-types';
import { getArrowShape } from './move-arrows-render';

export const isPositionEqual = (pos1: Position, pos2: Position): boolean => pos1.x === pos2.x && pos1.y === pos2.y;

export const isPositionOccupied = (position: Position, occupiedPositions: Position[]): boolean =>
  occupiedPositions.some((pos) => isPositionEqual(pos, position));

export const getDirectionFromKey = (key: string): Direction | null => {
  switch (key) {
    case 'ArrowUp':
    case 'w':
      return Direction.Up;
    case 'ArrowDown':
    case 's':
      return Direction.Down;
    case 'ArrowLeft':
    case 'a':
      return Direction.Left;
    case 'ArrowRight':
    case 'd':
      return Direction.Right;
    default:
      return null;
  }
};

export const getNewPosition = (currentPosition: Position, direction: Direction): Position => {
  switch (direction) {
    case Direction.Up:
      return { ...currentPosition, y: currentPosition.y - 1 };
    case Direction.Down:
      return { ...currentPosition, y: currentPosition.y + 1 };
    case Direction.Left:
      return { ...currentPosition, x: currentPosition.x - 1 };
    case Direction.Right:
      return { ...currentPosition, x: currentPosition.x + 1 };
  }
};

export function getOrthogonalDirection(direction: Direction, side: -1 | 1): Direction {
  switch (direction) {
    case Direction.Up:
      return side === -1 ? Direction.Left : Direction.Right;
    case Direction.Down:
      return side === -1 ? Direction.Left : Direction.Right;
    case Direction.Left:
      return side === -1 ? Direction.Down : Direction.Up;
    case Direction.Right:
      return side === -1 ? Direction.Up : Direction.Down;
  }
}

export const isValidMove = (
  newPosition: Position,
  gameState: GameState,
  gridSize: { width: number; height: number },
): boolean => {
  return (
    newPosition.x >= 0 &&
    newPosition.x < gridSize.width &&
    newPosition.y >= 0 &&
    newPosition.y < gridSize.height &&
    !isPositionOccupied(
      newPosition,
      gameState.obstacles.filter((obstacle) => !obstacle.isDestroying).map(({ position }) => position),
    )
  );
};

export const getValidMoves = (
  gameState: GameState,
  levelConfig: LevelConfig,
): { position: Position; direction: Direction }[] => {
  const { player } = gameState;
  const { gridSize } = levelConfig;
  const directions = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];

  return directions
    .map((direction) => ({ position: getNewPosition(player.position, direction), direction }))
    .filter(({ position }) => isValidMove(position, gameState, gridSize));
};

export function getMoveFromClick(
  canvasX: number,
  canvasY: number,
  gameState: GameState,
  levelConfig: LevelConfig,
  cellSize: number,
) {
  return getValidMoves(gameState, levelConfig).find((move) =>
    isPointInShape(canvasX, canvasY, getArrowShape(gameState.player.position, move.direction, move.position, cellSize)),
  );
}

function isPointInShape(canvasX: number, canvasY: number, points: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x,
      yi = points[i].y;
    const xj = points[j].x,
      yj = points[j].y;

    const intersect = yi > canvasY !== yj > canvasY && canvasX < ((xj - xi) * (canvasY - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}
