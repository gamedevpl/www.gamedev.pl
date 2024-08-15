import { Position, Monster, GridSize, PathfindingNode } from "./gameplay-types";

export const generateMonsters = (count: number, gridSize: GridSize, obstacles: Position[], existingMonsters: Position[], playerPosition: Position): Monster[] => {
  const monsters: Monster[] = [];
  const occupiedPositions = [...obstacles, ...existingMonsters, playerPosition];

  for (let i = 0; i < count; i++) {
    let pos: Position;
    do {
      pos = {
        x: Math.floor(Math.random() * gridSize.width),
        y: Math.floor(Math.random() * gridSize.height)
      };
    } while (
      isPositionOccupied(pos, occupiedPositions) ||
      isAdjacentTo(pos, playerPosition)
    );

    monsters.push({
      position: pos,
      path: []
    });
    occupiedPositions.push(pos);
  }

  return monsters;
};

export const moveMonsters = (monsters: Monster[], playerPosition: Position, gridSize: GridSize, obstacles: Position[]): Monster[] => {
  return monsters.map(monster => {
    const path = findPath(monster.position, playerPosition, gridSize, obstacles, monsters);
    const newPosition = path.length > 1 ? path[1] : monster.position;
    return { ...monster, position: newPosition, path };
  });
};

const findPath = (start: Position, goal: Position, gridSize: GridSize, obstacles: Position[], monsters: Monster[]): Position[] => {
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
        isPositionOccupied(neighbor, obstacles) ||
        isPositionOccupied(neighbor, monsters.map(m => m.position)) ||
        closedSet.some(node => isPositionEqual(node.position, neighbor))
      ) {
        continue;
      }

      const gScore = currentNode.g + 1;
      const hScore = manhattanDistance(neighbor, goal);
      const fScore = gScore + hScore;

      const openNode = openSet.find(node => isPositionEqual(node.position, neighbor));
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
          parent: currentNode
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

const getNeighbors = (position: Position, gridSize: GridSize): Position[] => {
  const neighbors: Position[] = [
    { x: position.x - 1, y: position.y },
    { x: position.x + 1, y: position.y },
    { x: position.x, y: position.y - 1 },
    { x: position.x, y: position.y + 1 }
  ];

  return neighbors.filter(pos =>
    pos.x >= 0 && pos.x < gridSize.width && pos.y >= 0 && pos.y < gridSize.height
  );
};

const manhattanDistance = (pos1: Position, pos2: Position): number => {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
};

const isPositionEqual = (pos1: Position, pos2: Position): boolean => {
  return pos1.x === pos2.x && pos1.y === pos2.y;
};

const isPositionOccupied = (pos: Position, occupiedPositions: Position[]): boolean => {
  return occupiedPositions.some(p => isPositionEqual(p, pos));
};

const isAdjacentTo = (pos1: Position, pos2: Position): boolean => {
  const dx = Math.abs(pos1.x - pos2.x);
  const dy = Math.abs(pos1.y - pos2.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
};

export const checkCollision = (playerPosition: Position, monsters: Monster[]): boolean => {
  return monsters.some(monster => 
    isPositionEqual(monster.position, playerPosition)
  );
};