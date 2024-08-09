import { Position } from '../world-state-types';

export function getRandomPosition(worldWidth: number, worldHeight: number, sectorSize: number): Position {
  return {
    x: Math.floor(Math.random() * (worldWidth * 0.8) + worldWidth * 0.1) * sectorSize,
    y: Math.floor(Math.random() * (worldHeight * 0.8) + worldHeight * 0.1) * sectorSize,
  };
}

export function isValidPosition(
  pos: Position,
  statePositions: Position[],
  worldWidth: number,
  worldHeight: number,
): boolean {
  if (pos.x < 0 || pos.y < 0 || pos.x >= worldWidth || pos.y >= worldHeight) {
    return false;
  }

  const minDistance = Math.floor(worldWidth / (Math.sqrt(statePositions.length + 1) * 2));
  return statePositions.every(
    (statePos) => Math.abs(pos.x - statePos.x) > minDistance || Math.abs(pos.y - statePos.y) > minDistance,
  );
}

export function isFarEnough(pos: Position, entities: { position: Position }[], minDistance: number): boolean {
  return entities.every(
    (entity) =>
      Math.sqrt(Math.pow(pos.x - entity.position.x, 2) + Math.pow(pos.y - entity.position.y, 2)) >= minDistance,
  );
}

export function calculateDistance(pos1: Position, pos2: Position): number {
  return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function isWithinBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

export function generateUniqueId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}
