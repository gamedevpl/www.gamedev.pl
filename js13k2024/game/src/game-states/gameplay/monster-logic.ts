import { Position, Monster, PathfindingNode, Explosion, Obstacle } from './gameplay-types';
import { isPositionEqual, isPositionOccupied, manhattanDistance } from './move-utils';

export const moveMonsters = (
  monsters: Monster[],
  playerPosition: Position,
  gridSize: number,
  obstacles: Obstacle[],
  isPlayerInvisible: boolean,
  isConfused: boolean,
  isPlayerMonster: boolean,
): Monster[] => {
  const newPositions: Position[] = [];
  return monsters.map((monster) => {
    let path: Position[];
    if (isPlayerInvisible) {
      // If the player is invisible, move randomly
      path = getRandomAdjacentPosition(monster.position, gridSize, obstacles, monsters);
    } else {
      // If the player is visible, use pathfinding
      path = findPath(monster.position, playerPosition, gridSize, obstacles, monsters);
    }

    let newPosition: Position;
    if (isConfused || isPlayerMonster) {
      // If monsters are confused, or player is the monster, move in the opposite direction
      newPosition = getConfusedPosition(monster.position, path[1] || monster.position, gridSize, obstacles, monsters);
    } else {
      newPosition = path.length > 1 ? path[1] : monster.position;
    }

    // Check if the new position is already occupied by another monster
    if (isPositionOccupied(newPosition, newPositions)) {
      newPosition = monster.position; // Stay in the current position if the new one is occupied
    } else {
      newPositions.push(newPosition); // Add the new position to the list of occupied positions
    }

    return { ...monster, previousPosition: monster.position, position: newPosition, moveTimestamp: Date.now(), path };
  });
};

const getConfusedPosition = (
  currentPosition: Position,
  intendedPosition: Position,
  gridSize: number,
  obstacles: Obstacle[],
  monsters: Monster[],
): Position => {
  const dx = intendedPosition.x - currentPosition.x;
  const dy = intendedPosition.y - currentPosition.y;

  // Calculate the opposite direction
  const oppositePosition: Position = {
    x: Math.max(0, Math.min(gridSize - 1, currentPosition.x - dx)),
    y: Math.max(0, Math.min(gridSize - 1, currentPosition.y - dy)),
  };

  // Check if the opposite position is valid (not occupied by obstacles or other monsters)
  if (
    !isPositionOccupied(
      oppositePosition,
      obstacles.map(({ position }) => position),
    ) &&
    !isPositionOccupied(
      oppositePosition,
      monsters.map((m) => m.position),
    )
  ) {
    return oppositePosition;
  }

  // If the opposite position is not valid, stay in the current position
  return currentPosition;
};

const getRandomAdjacentPosition = (
  position: Position,
  gridSize: number,
  obstacles: Obstacle[],
  monsters: Monster[],
): Position[] => {
  const adjacentPositions = [
    { x: position.x - 1, y: position.y },
    { x: position.x + 1, y: position.y },
    { x: position.x, y: position.y - 1 },
    { x: position.x, y: position.y + 1 },
  ].filter(
    (pos) =>
      pos.x >= 0 &&
      pos.x < gridSize &&
      pos.y >= 0 &&
      pos.y < gridSize &&
      !isPositionOccupied(
        pos,
        obstacles.map(({ position }) => position),
      ) &&
      !isPositionOccupied(
        pos,
        monsters.map((m) => m.position),
      ),
  );

  if (adjacentPositions.length > 0) {
    const randomIndex = Math.floor(Math.random() * adjacentPositions.length);
    return [position, adjacentPositions[randomIndex]];
  }

  return [position];
};

const findPath = (
  start: Position,
  goal: Position,
  gridSize: number,
  obstacles: Obstacle[],
  monsters: Monster[],
): Position[] => {
  const openSet: PathfindingNode[] = [];
  const closedSet: PathfindingNode[] = [];
  const startNode: PathfindingNode = { position: start, g: 0, h: 0, f: 0, parent: null };

  openSet.push(startNode);

  while (openSet.length > 0) {
    let currentNode = openSet[0];
    let currentIndex = 0;

    openSet.forEach((node, index) => {
      if (node.f < currentNode.f) {
        currentNode = node;
        currentIndex = index;
      }
    });

    openSet.splice(currentIndex, 1);
    closedSet.push(currentNode);

    if (isPositionEqual(currentNode.position, goal)) {
      return reconstructPath(currentNode);
    }

    const neighbors = getNeighbors(currentNode.position, gridSize);
    for (const neighbor of neighbors) {
      if (
        isPositionOccupied(
          neighbor,
          obstacles.map(({ position }) => position),
        ) ||
        isPositionOccupied(
          neighbor,
          monsters.map((m) => m.position),
        ) ||
        closedSet.some((node) => isPositionEqual(node.position, neighbor))
      ) {
        continue;
      }

      const gScore = currentNode.g + 1;
      const hScore = manhattanDistance(neighbor, goal);
      const fScore = gScore + hScore;

      const openNode = openSet.find((node) => isPositionEqual(node.position, neighbor));
      if (openNode) {
        if (gScore < openNode.g) {
          openNode.g = gScore;
          openNode.f = fScore;
          openNode.parent = currentNode;
        }
      } else {
        openSet.push({
          position: neighbor,
          g: gScore,
          h: hScore,
          f: fScore,
          parent: currentNode,
        });
      }
    }
  }

  return [start]; // Return current position if no path found
};

const reconstructPath = (node: PathfindingNode): Position[] => {
  const path: Position[] = [];
  let current: PathfindingNode | null = node;
  while (current !== null) {
    path.unshift(current.position);
    current = current.parent;
  }
  return path;
};

const getNeighbors = (position: Position, gridSize: number): Position[] => {
  const neighbors: Position[] = [
    { x: position.x - 1, y: position.y },
    { x: position.x + 1, y: position.y },
    { x: position.x, y: position.y - 1 },
    { x: position.x, y: position.y + 1 },
  ];

  return neighbors.filter((pos) => pos.x >= 0 && pos.x < gridSize && pos.y >= 0 && pos.y < gridSize);
};

export const checkCollision = (playerPosition: Position, monsters: Monster[]): boolean => {
  return monsters.some((monster) => isPositionEqual(monster.position, playerPosition));
};

export const checkLandMineCollision = (monsters: Monster[], landMines: Position[]): [Monster[], Explosion[]] => {
  const newExplosions: Explosion[] = [];
  const newMonsters = monsters.filter((monster) => {
    const landMine = landMines.find((mine) => isPositionEqual(mine, monster.position));
    if (landMine) {
      newExplosions.push({ position: landMine, startTime: Date.now(), duration: 1000 });
      removeLandMine(landMines, landMine);
      return false;
    } else {
      return true;
    }
  });
  return [newMonsters, newExplosions];
};

const removeLandMine = (landMines: Position[], landMine: Position): void => {
  landMines.splice(landMines.indexOf(landMine), 1);
};

export const checkTimeBombExplosion = (monster: Monster, explosion: Explosion): boolean => {
  return (
    Math.abs(monster.position.x - explosion.position.x) <= 1 && Math.abs(monster.position.y - explosion.position.y) <= 1
  );
};

export const isInExplosionRange = (position: Position, explosions: Explosion[]): boolean => {
  return explosions.some(
    (explosion) => Math.abs(position.x - explosion.position.x) <= 1 && Math.abs(position.y - explosion.position.y) <= 1,
  );
};
