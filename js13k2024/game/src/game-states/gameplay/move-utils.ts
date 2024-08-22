import { BonusType, Direction, GameState, LevelConfig, Position } from './gameplay-types';
import { getArrowShape } from './render/move-arrows-render';

export const isPositionEqual = (pos1: Position, pos2: Position): boolean => pos1.x === pos2.x && pos1.y === pos2.y;

export const isPositionOccupied = (position: Position, occupiedPositions: Position[]): boolean =>
  occupiedPositions.some((pos) => isPositionEqual(pos, position));

export const manhattanDistance = (pos1: Position, pos2: Position): number => {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
};

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

export const getNewPosition = (currentPosition: Position, direction: Direction, movement = 1): Position => {
  switch (direction) {
    case Direction.Up:
      return { ...currentPosition, y: currentPosition.y - movement };
    case Direction.Down:
      return { ...currentPosition, y: currentPosition.y + movement };
    case Direction.Left:
      return { ...currentPosition, x: currentPosition.x - movement };
    case Direction.Right:
      return { ...currentPosition, x: currentPosition.x + movement };
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
  { gridSize }: Pick<LevelConfig, 'gridSize'>,
): boolean => {
  const isWithinGrid = newPosition.x >= 0 && newPosition.x < gridSize && newPosition.y >= 0 && newPosition.y < gridSize;

  if (!isWithinGrid) {
    return false;
  }

  const isObstaclePresent = isPositionOccupied(
    newPosition,
    gameState.obstacles.filter((obstacle) => !obstacle.isDestroying).map(({ position }) => position),
  );

  // Allow movement onto obstacles if the player has the Climber bonus active
  if (isObstaclePresent && !gameState.player.isClimbing && !gameState.crusherActive) {
    // Check if Sokoban bonus is active
    if (gameState.activeBonuses.some((bonus) => bonus.type === BonusType.Sokoban)) {
      const pushDirection = getDirectionFromPositions(gameState.player.position, newPosition);
      const pushedPosition = getNewPosition(newPosition, pushDirection);
      // Check if the pushed position is valid
      if (
        isWithinGrid &&
        !isPositionOccupied(
          pushedPosition,
          gameState.obstacles.map((o) => o.position),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  return true;
};

export const getValidMoves = (
  gameState: GameState,
  levelConfig: LevelConfig,
): { position: Position; direction: Direction }[] => {
  const { player } = gameState;
  const directions = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];

  if (gameState.isSliding) {
    // For sliding, we need to check the entire path until an obstacle or grid edge
    return directions
      .map((direction) => {
        let position = player.position;
        while (isValidMove(getNewPosition(position, direction), gameState, levelConfig)) {
          position = getNewPosition(position, direction);
        }
        return { position, direction };
      })
      .filter((move) => !isPositionEqual(move.position, player.position));
  } else {
    return directions
      .map((direction) => ({ position: getNewPosition(player.position, direction), direction }))
      .filter(({ position }) => isValidMove(position, gameState, levelConfig));
  }
};

export function getMoveFromClick(canvasX: number, canvasY: number, gameState: GameState, levelConfig: LevelConfig) {
  return getValidMoves(gameState, levelConfig).find((move) =>
    isPointInShape(canvasX, canvasY, getArrowShape(levelConfig.gridSize, levelConfig.cellSize, move.direction)),
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

export function getDirectionFromPositions(from: Position, to: Position): Direction {
  if (to.x > from.x) return Direction.Right;
  if (to.x < from.x) return Direction.Left;
  if (to.y > from.y) return Direction.Down;
  return Direction.Up;
}
