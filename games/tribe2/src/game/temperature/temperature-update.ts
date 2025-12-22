import { Vector2D } from '../utils/math-types';
import { GameWorldState } from '../world-types';
import {
  BASE_TEMPERATURE_DEFAULT,
  TEMPERATURE_SECTOR_SIZE,
  BONFIRE_HEAT_RADIUS,
  BONFIRE_HEAT_INTENSITY,
  TEMPERATURE_CYCLE_AMPLITUDE,
} from './temperature-consts';
import { getTemperatureSectorKey, TemperatureState, TemperatureSector } from './temperature-types';
import { calculateWrappedDistance } from '../utils/math-utils';
import { BuildingEntity } from '../entities/buildings/building-types';
import { getDaylightFactor } from '../utils/time-utils';

/**
 * Converts a world position to temperature grid coordinates.
 */
function positionToTemperatureGridCoords(
  position: Vector2D,
  worldWidth: number,
  worldHeight: number,
): { gridX: number; gridY: number } {
  // Handle wrapping
  const wrappedX = ((position.x % worldWidth) + worldWidth) % worldWidth;
  const wrappedY = ((position.y % worldHeight) + worldHeight) % worldHeight;

  return {
    gridX: Math.floor(wrappedX / TEMPERATURE_SECTOR_SIZE),
    gridY: Math.floor(wrappedY / TEMPERATURE_SECTOR_SIZE),
  };
}

/**
 * Gets the temperature at a specific world position.
 * @param state The current temperature state.
 * @param position The position to check.
 * @param time The current game time.
 * @param worldWidth The width of the game world.
 * @param worldHeight The height of the game world.
 * @returns The temperature in degrees Celsius.
 */
export function getTemperatureAt(
  state: TemperatureState,
  position: Vector2D,
  time: number,
  worldWidth: number,
  worldHeight: number,
): number {
  const { gridX, gridY } = positionToTemperatureGridCoords(position, worldWidth, worldHeight);
  const key = getTemperatureSectorKey(gridX, gridY);
  const sector = state.sectors[key];

  const baseTemp = sector ? sector.currentTemperature : BASE_TEMPERATURE_DEFAULT;

  const daylightFactor = getDaylightFactor(time);
  const cycleTempOffset = (daylightFactor * 2 - 1) * TEMPERATURE_CYCLE_AMPLITUDE;

  return baseTemp + cycleTempOffset;
}

/**
 * Updates the temperature state based on game time and events.
 * Applies heat from active bonfires to the temperature grid.
 */
export function updateTemperature(gameState: GameWorldState): void {
  const { sectors } = gameState.temperature;
  const { width, height } = gameState.mapDimensions;

  const cols = Math.ceil(width / TEMPERATURE_SECTOR_SIZE);
  const rows = Math.ceil(height / TEMPERATURE_SECTOR_SIZE);

  // 1. Reset currentTemperature to baseTemperature
  for (const key in sectors) {
    const sector = sectors[key];
    sector.currentTemperature = sector.baseTemperature;
  }

  // 2. Apply heat from bonfires
  const sectorSearchRadius = Math.ceil(BONFIRE_HEAT_RADIUS / TEMPERATURE_SECTOR_SIZE);

  Object.values(gameState.entities.entities).forEach((entity) => {
    if (entity.type === 'building') {
      const building = entity as BuildingEntity;
      // Using string literal 'bonfire' as BuildingType.Bonfire might not be defined yet in consts
      if (
        building.buildingType === 'bonfire' &&
        building.isConstructed &&
        (building as BuildingEntity).fuelLevel! > 0
      ) {
        const bonfireCoords = positionToTemperatureGridCoords(building.position, width, height);

        // Iterate through sectors in a neighborhood around the bonfire
        for (let dy = -sectorSearchRadius; dy <= sectorSearchRadius; dy++) {
          for (let dx = -sectorSearchRadius; dx <= sectorSearchRadius; dx++) {
            const gx = (bonfireCoords.gridX + dx + cols) % cols;
            const gy = (bonfireCoords.gridY + dy + rows) % rows;

            const key = getTemperatureSectorKey(gx, gy);
            const sector = sectors[key];

            if (sector) {
              const sectorCenter: Vector2D = {
                x: (gx + 0.5) * TEMPERATURE_SECTOR_SIZE,
                y: (gy + 0.5) * TEMPERATURE_SECTOR_SIZE,
              };

              const distance = calculateWrappedDistance(building.position, sectorCenter, width, height);

              if (distance < BONFIRE_HEAT_RADIUS) {
                // Linear falloff: heat is max at center, 0 at BONFIRE_HEAT_RADIUS
                const heatIncrease = BONFIRE_HEAT_INTENSITY * (1 - distance / BONFIRE_HEAT_RADIUS);
                sector.currentTemperature += heatIncrease;
              }
            }
          }
        }
      }
    }
  });
}

/**
 * Initializes the temperature state with regional variations.
 * @param worldWidth The width of the game world.
 * @param worldHeight The height of the game world.
 * @returns An initialized TemperatureState.
 */
export function initTemperatureState(worldWidth: number, worldHeight: number): TemperatureState {
  const sectors: Record<string, TemperatureSector> = {};
  const cols = Math.ceil(worldWidth / TEMPERATURE_SECTOR_SIZE);
  const rows = Math.ceil(worldHeight / TEMPERATURE_SECTOR_SIZE);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const key = getTemperatureSectorKey(x, y);

      // Start with base temperature
      let temp = BASE_TEMPERATURE_DEFAULT;

      // Add a simple gradient variation (colder in the "north" / top of map)
      const gradientFactor = (y / rows) * 10 - 5; // -5 to +5 degrees
      temp += gradientFactor;

      // Add some random local variance
      temp += Math.random() * 4 - 2; // +/- 2 degrees

      // Occasionally add a "cold spot"
      if (Math.random() < 0.05) {
        temp -= 10;
      }

      sectors[key] = {
        baseTemperature: temp,
        currentTemperature: temp,
      };
    }
  }

  return {
    sectors,
  };
}
