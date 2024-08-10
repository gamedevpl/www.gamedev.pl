import { SECTOR_SIZE } from '../world-state-constants';
import { Sector, SectorType, Position } from '../world-state-types';
import { createSimplexNoise } from './simplex-noise';

export function createGround(
  center: Position,
  maxSteps: number,
  sectors: Sector[],
  worldWidth: number,
  worldHeight: number,
) {
  const noise = createSimplexNoise();
  const centerX = Math.floor(center.x / SECTOR_SIZE);
  const centerY = Math.floor(center.y / SECTOR_SIZE);
  const radius = Math.floor(worldWidth / 4);
  const threshold = 0.5;
  const noiseScale = 0.005;
  const walkProbability = 0.7;

  for (let y = centerY - radius; y <= centerY + radius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      if (x >= 0 && x < worldWidth && y >= 0 && y < worldHeight) {
        // Random walk adjustment
        let walkX = x;
        let walkY = y;
        for (let step = 0; step < maxSteps; step++) {
          if (Math.random() < walkProbability) {
            walkX += Math.random() > 0.5 ? 1 : -1;
            walkY += Math.random() > 0.5 ? 1 : -1;
          }
        }

        // Ensure within bounds
        walkX = Math.max(0, Math.min(worldWidth - 1, walkX));
        walkY = Math.max(0, Math.min(worldHeight - 1, walkY));

        const distanceFromCenter =
          Math.sqrt((walkX - centerX) * (walkX - centerX) + (walkY - centerY) * (walkY - centerY)) / radius;
        const noiseValue = noise(x * noiseScale, y * noiseScale);

        if (distanceFromCenter < 1 && noiseValue > threshold + distanceFromCenter * 0.01) {
          const index = y * worldWidth + x;
          sectors[index].type = SectorType.GROUND;
          sectors[index].depth = undefined;
          sectors[index].height = (1 - distanceFromCenter) * 2 * (noiseValue - threshold);
        }
      }
    }
  }

  // Ensure the center is always ground
  const centerIndex = Math.min(Math.max(centerY * worldWidth + centerX, 0), worldWidth);
  sectors[centerIndex].type = SectorType.GROUND;
  sectors[centerIndex].depth = undefined;
  sectors[centerIndex].height = 1;
}
