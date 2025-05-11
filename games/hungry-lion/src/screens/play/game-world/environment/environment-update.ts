import { Environment, isGrassSector, Sector } from './environment-types';
import { UpdateContext } from '../game-world-types';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from '../game-world-consts';

// Constants for environment mechanics
const GRASS_REGENERATION_RATE = 0.1; // How much grass grows per second
const MAX_GRASS_DENSITY = 100; // Maximum grass density

// Constants for initial environment generation
const MIN_SECTOR_SIZE = 50;
const MAX_SECTOR_SIZE = 150;
const SECTOR_MARGIN = 50; // Margin from world edges for sector placement

// New constants for clustered generation
const NUM_GRASS_ZONES = 3;
const NUM_WATER_ZONES = 2;
const SATELLITE_SECTORS_PER_ZONE_MIN = 2; // Min satellites per zone
const SATELLITE_SECTORS_PER_ZONE_MAX = 4; // Max satellites per zone
const MAX_SATELLITE_OFFSET = 100;       // Max offset from parent center for satellite's center
const SATELLITE_SIZE_FACTOR_MIN = 0.3;  // Min size of satellite relative to parent
const SATELLITE_SIZE_FACTOR_MAX = 0.7;  // Max size of satellite relative to parent
const MIN_SATELLITE_SIZE = 20;          // Absolute minimum size for a satellite sector

/**
 * Updates grass density over time and handles sector state
 */
export function environmentUpdate(updateContext: UpdateContext): Environment {
  const environment = updateContext.gameState.environment;

  // Update each sector
  environment.sectors = environment.sectors.map((sector) => {
    if (isGrassSector(sector)) {
      // Regenerate grass over time
      return {
        ...sector,
        density: Math.min(MAX_GRASS_DENSITY, sector.density + GRASS_REGENERATION_RATE * updateContext.deltaTime),
      };
    }
    return sector;
  });

  return environment;
}

/**
 * Initialize the environment with grass and water sectors, generated in clusters for a more organic look.
 */
export function environmentInit(): Environment {
  const sectors: Sector[] = [];

  // Helper function to generate a cluster of sectors
  const generateSectorCluster = (type: 'grass' | 'water', numZones: number) => {
    for (let i = 0; i < numZones; i++) {
      // Main sector for the zone
      const mainWidth = Math.random() * (MAX_SECTOR_SIZE - MIN_SECTOR_SIZE) + MIN_SECTOR_SIZE;
      const mainHeight = Math.random() * (MAX_SECTOR_SIZE - MIN_SECTOR_SIZE) + MIN_SECTOR_SIZE;
      
      const mainX = SECTOR_MARGIN + Math.random() * (GAME_WORLD_WIDTH - mainWidth - 2 * SECTOR_MARGIN);
      const mainY = SECTOR_MARGIN + Math.random() * (GAME_WORLD_HEIGHT - mainHeight - 2 * SECTOR_MARGIN);
      
      const mainSectorCenterX = mainX + mainWidth / 2;
      const mainSectorCenterY = mainY + mainHeight / 2;

      const mainDensity = type === 'grass' ? Math.random() * 50 + 50 : undefined; // 50-100 for grass
      const mainDepth = type === 'water' ? Math.random() * 0.6 + 0.2 : undefined;   // 0.2-0.8 for water

      if (type === 'grass') {
        sectors.push({
          rect: { x: mainX, y: mainY, width: mainWidth, height: mainHeight },
          type: 'grass',
          density: mainDensity!,
        });
      } else {
        sectors.push({
          rect: { x: mainX, y: mainY, width: mainWidth, height: mainHeight },
          type: 'water',
          depth: mainDepth!,
        });
      }

      // Generate satellite sectors for this zone
      const numSatellites = Math.floor(Math.random() * (SATELLITE_SECTORS_PER_ZONE_MAX - SATELLITE_SECTORS_PER_ZONE_MIN + 1)) + SATELLITE_SECTORS_PER_ZONE_MIN;
      for (let j = 0; j < numSatellites; j++) {
        const offsetX = (Math.random() - 0.5) * 2 * MAX_SATELLITE_OFFSET;
        const offsetY = (Math.random() - 0.5) * 2 * MAX_SATELLITE_OFFSET;

        const satSizeFactor = Math.random() * (SATELLITE_SIZE_FACTOR_MAX - SATELLITE_SIZE_FACTOR_MIN) + SATELLITE_SIZE_FACTOR_MIN;
        let satWidth = Math.max(MIN_SATELLITE_SIZE, mainWidth * satSizeFactor);
        let satHeight = Math.max(MIN_SATELLITE_SIZE, mainHeight * satSizeFactor);

        let satX = mainSectorCenterX + offsetX - satWidth / 2;
        let satY = mainSectorCenterY + offsetY - satHeight / 2;

        // Clamp satellite position to be within game world, respecting margins
        satX = Math.max(SECTOR_MARGIN, Math.min(satX, GAME_WORLD_WIDTH - satWidth - SECTOR_MARGIN));
        satY = Math.max(SECTOR_MARGIN, Math.min(satY, GAME_WORLD_HEIGHT - satHeight - SECTOR_MARGIN));

        // Ensure width and height are still valid after potential clamping of X/Y affecting available space
        satWidth = Math.min(satWidth, GAME_WORLD_WIDTH - SECTOR_MARGIN - satX);
        satHeight = Math.min(satHeight, GAME_WORLD_HEIGHT - SECTOR_MARGIN - satY);
        
        if (satWidth < MIN_SATELLITE_SIZE || satHeight < MIN_SATELLITE_SIZE) {
            continue; // Skip if clamping made it too small
        }

        if (type === 'grass') {
          sectors.push({
            rect: { x: satX, y: satY, width: satWidth, height: satHeight },
            type: 'grass',
            density: Math.random() * 40 + 30, // Density 30-70 for satellites
          });
        } else {
          sectors.push({
            rect: { x: satX, y: satY, width: satWidth, height: satHeight },
            type: 'water',
            depth: Math.random() * 0.4 + 0.1, // Depth 0.1-0.5 for satellites
          });
        }
      }
    }
  };

  // Generate grass zones and their satellite sectors
  generateSectorCluster('grass', NUM_GRASS_ZONES);

  // Generate water zones and their satellite sectors
  generateSectorCluster('water', NUM_WATER_ZONES);

  return { sectors };
}
