import { GameWorldState, FIREBALL_PHYSICS, SANTA_PHYSICS } from '../game-world/game-world-types';
import { FireQuadTree } from './fire-render-quad-tree';
import {
  FireCell,
  GRID_WIDTH,
  GRID_HEIGHT,
  GRID_CELL_SIZE,
  MAX_TEMPERATURE,
  SANTA_ENERGY_HEAT_SPOTS_MAX,
  SANTA_ENERGY_HEAT_SPOT_PROBABILITY,
  SANTA_ENERGY_HEAT_SPOT_TEMPERATURE,
  SANTA_ENERGY_HEAT_SPOT_RANGE,
} from './fire-render-types';

/**
 * Represents a region in the grid that needs heat calculation
 */
type HeatRegion = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * Calculate the temperature at a specific grid position based on nearby fireballs.
 * Implements nucleus concept where inner half of radius maintains max temperature.
 *
 * @param worldX - X coordinate in world space
 * @param worldY - Y coordinate in world space
 * @param fireballs - Array of active fireballs
 * @returns Calculated temperature value between 0 and MAX_TEMPERATURE
 */
export function calculateFireballHeat(worldX: number, worldY: number, fireballs: GameWorldState['fireballs']): number {
  let maxTemp = 0;

  for (const fireball of fireballs) {
    const distance = Math.sqrt(Math.pow(worldX - fireball.x, 2) + Math.pow(worldY - fireball.y, 2));
    const nucleusRadius = fireball.radius * 0.3; // Nucleus is 30% of the fireball radius

    if (distance <= nucleusRadius) {
      // Inside nucleus - maximum temperature
      return MAX_TEMPERATURE; // Early exit on max temperature
    } else if (distance < fireball.radius * 0.5) {
      // Outside nucleus but inside fireball - linear falloff
      const normalizedDistance = (distance - nucleusRadius) / (fireball.radius - nucleusRadius);
      const temp = MAX_TEMPERATURE * (1 - normalizedDistance);
      maxTemp = Math.max(maxTemp, temp);
    }
  }

  return maxTemp;
}

/**
 * Generate a single heat spot based on santa's energy level with optimized distance check
 * @param santa - Santa object
 * @param worldX - X coordinate in world space
 * @param worldY - Y coordinate in world space
 * @returns Temperature value for the heat spot
 */
function generateSantaEnergyHeatSpot(santa: GameWorldState['santas'][0], worldX: number, worldY: number): number {
  // Quick distance check using squared distance to avoid sqrt
  const dx = worldX - santa.x;
  const dy = worldY - santa.y;
  const distanceSquared = dx * dx + dy * dy;
  const rangeSquared = SANTA_ENERGY_HEAT_SPOT_RANGE * SANTA_ENERGY_HEAT_SPOT_RANGE;

  // Early exit if outside range
  if (distanceSquared > rangeSquared) {
    return 0;
  }

  // Scale probability with santa's energy
  const energyRatio = santa.energy / SANTA_PHYSICS.MAX_ENERGY;
  const probability = SANTA_ENERGY_HEAT_SPOT_PROBABILITY * energyRatio;

  // Generate heat spot with scaled probability
  return Math.random() < probability ? SANTA_ENERGY_HEAT_SPOT_TEMPERATURE : 0;
}

/**
 * Calculate the temperature at a specific grid position based on charging Santas.
 * Uses similar nucleus concept as fireballs but scales with charging duration.
 * Also includes movement-based trail heat calculation.
 *
 * @param worldX - X coordinate in world space
 * @param worldY - Y coordinate in world space
 * @param santas - Array of active Santas
 * @param currentTime - Current game time
 * @returns Calculated temperature value between 0 and MAX_TEMPERATURE
 */
export function calculateSantaHeat(
  worldX: number,
  worldY: number,
  santas: GameWorldState['santas'],
  currentTime: number,
): number {
  // Calculate movement-based trail heat first
  let trailTemp = 0;
  for (const santa of santas) {
    const velocity = Math.sqrt(santa.vx * santa.vx + santa.vy * santa.vy);
    const MIN_VELOCITY = 0.1;

    if (velocity > MIN_VELOCITY) {
      // Quick distance check for trail calculation
      const dx = worldX - santa.x;
      const dy = worldY - santa.y;
      const distanceSquared = dx * dx + dy * dy;
      const maxTrailDistance = 40; // TRAIL_LENGTH

      if (distanceSquared <= maxTrailDistance * maxTrailDistance) {
        // Normalize velocity vector for direction
        const nvx = -santa.vx / velocity; // Negative to position trail behind movement
        const nvy = -santa.vy / velocity;

        // Calculate trail parameters
        const TRAIL_LENGTH = 40;
        const TRAIL_WIDTH = 20;

        // Check if the current cell is within the trail area
        const trailX = dx;
        const trailY = dy;
        const projectedDist = trailX * nvx + trailY * nvy;
        const perpDist = Math.abs(trailX * nvy - trailY * nvx);

        if (projectedDist > 0 && projectedDist < TRAIL_LENGTH && perpDist < TRAIL_WIDTH) {
          trailTemp = Math.max(
            trailTemp,
            (1 - projectedDist / TRAIL_LENGTH) * (velocity / SANTA_PHYSICS.MAX_VELOCITY) * 0.3,
          );
        }
      }
    }

    // Generate energy-based heat spots
    const maxSpots = Math.floor(SANTA_ENERGY_HEAT_SPOTS_MAX * (santa.energy / SANTA_PHYSICS.MAX_ENERGY));
    if (maxSpots > 0) {
      const spotTemp = generateSantaEnergyHeatSpot(santa, worldX, worldY);
      trailTemp = Math.max(trailTemp, spotTemp);
    }
  }

  let maxTemp = 0;

  for (const santa of santas) {
    if (!santa.input.charging || !santa.input.chargeStartTime) continue;

    const chargeDuration = currentTime - santa.input.chargeStartTime;
    if (chargeDuration < FIREBALL_PHYSICS.MIN_CHARGE_TIME / 3) continue;

    // Quick distance check before detailed calculations
    const dx = worldX - santa.x;
    const dy = worldY - santa.y;
    const distanceSquared = dx * dx + dy * dy;
    const maxRadius =
      FIREBALL_PHYSICS.MIN_RADIUS + FIREBALL_PHYSICS.GROWTH_RATE * (FIREBALL_PHYSICS.MAX_CHARGE_TIME / 1000);

    if (distanceSquared > maxRadius * maxRadius) continue;

    // Scale radius based on charge duration, capped at max charge time
    const chargeProgress = Math.min(
      (chargeDuration - FIREBALL_PHYSICS.MIN_CHARGE_TIME / 3) /
        (FIREBALL_PHYSICS.MAX_CHARGE_TIME - FIREBALL_PHYSICS.MIN_CHARGE_TIME / 3),
      1,
    );

    const radius =
      FIREBALL_PHYSICS.MIN_RADIUS +
      FIREBALL_PHYSICS.GROWTH_RATE * chargeProgress * (FIREBALL_PHYSICS.MAX_CHARGE_TIME / 1000);

    const distance = Math.sqrt(distanceSquared);
    const nucleusRadius = radius * 0.6;

    if (distance <= nucleusRadius * 0.9) {
      continue;
    } else if (distance <= nucleusRadius) {
      // Inside nucleus - temperature scales with charge progress
      maxTemp = Math.max(maxTemp, MAX_TEMPERATURE * chargeProgress);
    } else if (distance < radius * 0.5) {
      // Outside nucleus but inside heat radius - linear falloff
      const normalizedDistance = (distance - nucleusRadius) / (radius - nucleusRadius);
      const temp = MAX_TEMPERATURE * chargeProgress * (1 - normalizedDistance);
      maxTemp = Math.max(maxTemp, temp);
    }
  }

  return Math.max(maxTemp, trailTemp);
}

/**
 * Calculate regions that need heat computation based on heat sources
 * @param world - Current game world state
 * @returns Array of regions that need heat computation
 */
function calculateHeatRegions(world: GameWorldState): HeatRegion[] {
  const regions: HeatRegion[] = [];

  // Add regions for fireballs
  for (const fireball of world.fireballs) {
    const radius = fireball.radius * 0.5; // Use half radius for heat effect
    const gridMinX = Math.max(0, Math.floor((fireball.x - radius) / GRID_CELL_SIZE));
    const gridMinY = Math.max(0, Math.floor((fireball.y - radius) / GRID_CELL_SIZE));
    const gridMaxX = Math.min(GRID_WIDTH - 1, Math.ceil((fireball.x + radius) / GRID_CELL_SIZE));
    const gridMaxY = Math.min(GRID_HEIGHT - 1, Math.ceil((fireball.y + radius) / GRID_CELL_SIZE));

    regions.push({ minX: gridMinX, minY: gridMinY, maxX: gridMaxX, maxY: gridMaxY });
  }

  // Add regions for charging santas
  for (const santa of world.santas) {
    if (santa.input.charging && santa.input.chargeStartTime) {
      const chargeDuration = world.time - santa.input.chargeStartTime;
      if (chargeDuration < FIREBALL_PHYSICS.MIN_CHARGE_TIME / 3) continue;

      const radius =
        FIREBALL_PHYSICS.MIN_RADIUS + FIREBALL_PHYSICS.GROWTH_RATE * (FIREBALL_PHYSICS.MAX_CHARGE_TIME / 1000);

      const gridMinX = Math.max(0, Math.floor((santa.x - radius) / GRID_CELL_SIZE));
      const gridMinY = Math.max(0, Math.floor((santa.y - radius) / GRID_CELL_SIZE));
      const gridMaxX = Math.min(GRID_WIDTH - 1, Math.ceil((santa.x + radius) / GRID_CELL_SIZE));
      const gridMaxY = Math.min(GRID_HEIGHT - 1, Math.ceil((santa.y + radius) / GRID_CELL_SIZE));

      regions.push({ minX: gridMinX, minY: gridMinY, maxX: gridMaxX, maxY: gridMaxY });
    }

    // Add regions for santa trails
    if (Math.sqrt(santa.vx * santa.vx + santa.vy * santa.vy) > 0.1) {
      const TRAIL_RADIUS = 40;
      const gridMinX = Math.max(0, Math.floor((santa.x - TRAIL_RADIUS) / GRID_CELL_SIZE));
      const gridMinY = Math.max(0, Math.floor((santa.y - TRAIL_RADIUS) / GRID_CELL_SIZE));
      const gridMaxX = Math.min(GRID_WIDTH - 1, Math.ceil((santa.x + TRAIL_RADIUS) / GRID_CELL_SIZE));
      const gridMaxY = Math.min(GRID_HEIGHT - 1, Math.ceil((santa.y + TRAIL_RADIUS) / GRID_CELL_SIZE));

      regions.push({ minX: gridMinX, minY: gridMinY, maxX: gridMaxX, maxY: gridMaxY });
    }

    if (santa.energy > 0) {
      regions.push({
        minX: Math.max(Math.floor((santa.x - SANTA_ENERGY_HEAT_SPOT_RANGE) / GRID_CELL_SIZE), 0),
        minY: Math.max(Math.floor((santa.y - SANTA_ENERGY_HEAT_SPOT_RANGE) / GRID_CELL_SIZE), 0),
        maxX: Math.min(GRID_WIDTH - 1, Math.floor((santa.x + SANTA_ENERGY_HEAT_SPOT_RANGE) / GRID_CELL_SIZE)),
        maxY: Math.min(GRID_HEIGHT - 1, Math.floor((santa.y + SANTA_ENERGY_HEAT_SPOT_RANGE) / GRID_CELL_SIZE)),
      });
    }
  }

  return regions;
}

/**
 * Merge overlapping heat regions to minimize redundant calculations
 * @param regions - Array of heat regions
 * @returns Array of merged heat regions
 */
function mergeHeatRegions(regions: HeatRegion[]): HeatRegion[] {
  if (regions.length <= 1) return regions;

  const merged: HeatRegion[] = [];
  regions.sort((a, b) => a.minX - b.minX);

  let current = regions[0];

  for (let i = 1; i < regions.length; i++) {
    const next = regions[i];

    // Check if regions overlap
    if (
      current.maxX >= next.minX - 1 &&
      current.minX <= next.maxX + 1 &&
      current.maxY >= next.minY - 1 &&
      current.minY <= next.maxY + 1
    ) {
      // Merge regions
      current = {
        minX: Math.min(current.minX, next.minX),
        minY: Math.min(current.minY, next.minY),
        maxX: Math.max(current.maxX, next.maxX),
        maxY: Math.max(current.maxY, next.maxY),
      };
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Precompute heat distribution from fireballs and charging Santas for the entire grid.
 * Optimizes computation by checking for heat sources first and using region-based calculation.
 *
 * @param world - Current game world state
 * @param grid - Fire grid to update
 * @param quadTree - Quad tree for spatial optimization
 */
export function computeHeatMap(world: GameWorldState, grid: FireCell[][], quadTree: FireQuadTree): void {
  const hasHeatSources =
    world.fireballs.length > 0 ||
    world.santas.some(
      (santa) =>
        (santa.input.charging && santa.input.chargeStartTime) ||
        Math.sqrt(santa.vx * santa.vx + santa.vy * santa.vy) > 0.1 ||
        santa.energy > 0,
    );

  if (!hasHeatSources) {
    // No heat sources, skip computation
    return;
  }

  // Calculate and merge heat regions
  const regions = mergeHeatRegions(calculateHeatRegions(world));

  // Process each region
  for (const region of regions) {
    for (let y = region.minY; y <= region.maxY; y++) {
      for (let x = region.minX; x <= region.maxX; x++) {
        const worldX = x * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
        const worldY = y * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;

        // Combine heat from both fireballs and charging Santas
        const fireballTemp = calculateFireballHeat(worldX, worldY, world.fireballs);
        const santaTemp = calculateSantaHeat(worldX, worldY, world.santas, world.time);

        // Use maximum temperature from either source
        const newTemp = Math.max(fireballTemp, santaTemp);

        // Update only if temperature changed
        if (newTemp !== grid[y][x].temperature) {
          grid[y][x].temperature = newTemp;
          quadTree.update(x, y, newTemp);
        }
      }
    }
  }
}
