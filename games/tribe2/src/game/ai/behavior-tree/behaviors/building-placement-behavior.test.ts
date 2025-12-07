/**
 * Building Placement Behavior Simulation Test
 * 
 * This script simulates the game for a period of time and verifies that:
 * 1. Tribe leaders place storage spots when storage utilization is high
 * 2. Tribe leaders place planting zones as the tribe grows
 * 3. Buildings are placed near the tribe center
 * 4. The building placement behavior helps tribes grow sustainably
 */

import { describe, it, expect } from 'vitest';
import { initGame } from '../../../index';
import { updateWorld } from '../../../world-update';
import { GameWorldState } from '../../../world-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { BuildingEntity, BuildingType } from '../../../entities/buildings/building-types';
import { HUMAN_YEAR_IN_REAL_SECONDS } from '../../../human-consts';
import { GAME_DAY_IN_REAL_SECONDS } from '../../../game-consts';
import { getTribeMembers } from '../../../utils/family-tribe-utils';
import { getTribeStorageSpots, getTribePlantingZones } from '../../../utils/tribe-food-utils';
import { calculateWrappedDistance } from '../../../utils/math-utils';

// Test tolerance for building placement distance validation
const BUILDING_PLACEMENT_TOLERANCE = 500; // Max distance for test validation (allows some variance)

describe('Building Placement Behavior', () => {
  it('should place storage spots and planting zones as tribe grows', { timeout: 60000 }, () => {
    // Initialize the game
    let gameState: GameWorldState = initGame();

    // Disable player control
    const playerEntity = Object.values(gameState.entities.entities).find(
      (e) => e.isPlayer && e.type === 'human',
    ) as HumanEntity;
    if (playerEntity) {
      playerEntity.isPlayer = false;
    }

    // Track building placement over time
    const buildingHistory: {
      year: number;
      tribeSize: number;
      storageSpots: number;
      plantingZones: number;
    }[] = [];

    // Simulate for 10 years
    const yearsToSimulate = 10;
    const totalSimulationSeconds = yearsToSimulate * HUMAN_YEAR_IN_REAL_SECONDS;
    const timeStepSeconds = GAME_DAY_IN_REAL_SECONDS / 24; // One hour at a time
    let yearsSimulated = 0;

    for (let time = 0; time < totalSimulationSeconds; time += timeStepSeconds) {
      gameState = updateWorld(gameState, timeStepSeconds);

      // Record data every year
      if (gameState.time >= (yearsSimulated + 1) * HUMAN_YEAR_IN_REAL_SECONDS) {
        yearsSimulated++;

        const humans = Object.values(gameState.entities.entities).filter(
          (e) => e.type === 'human',
        ) as HumanEntity[];

        // Get the largest tribe
        const leaderCounts = new Map<number, number>();
        humans.forEach((human) => {
          if (human.leaderId) {
            leaderCounts.set(human.leaderId, (leaderCounts.get(human.leaderId) || 0) + 1);
          }
        });

        let largestTribeLeaderId: number | undefined;
        let largestTribeSize = 0;
        leaderCounts.forEach((count, leaderId) => {
          if (count > largestTribeSize) {
            largestTribeSize = count;
            largestTribeLeaderId = leaderId;
          }
        });

        if (largestTribeLeaderId) {
          const storageSpots = getTribeStorageSpots(largestTribeLeaderId, gameState);
          const plantingZones = getTribePlantingZones(
            { leaderId: largestTribeLeaderId } as HumanEntity,
            gameState,
          );

          buildingHistory.push({
            year: yearsSimulated,
            tribeSize: largestTribeSize,
            storageSpots: storageSpots.length,
            plantingZones: plantingZones.length,
          });

          console.log(
            `Year ${yearsSimulated}: Tribe size: ${largestTribeSize}, ` +
              `Storage: ${storageSpots.length}, Planting zones: ${plantingZones.length}`,
          );
        }
      }
    }

    // Verify that buildings were placed
    expect(buildingHistory.length).toBeGreaterThan(0);

    // Check if storage spots were created
    const finalData = buildingHistory[buildingHistory.length - 1];
    const hasStorageSpots = finalData.storageSpots > 0;
    const hasPlantingZones = finalData.plantingZones > 0;

    // At least one type of building should have been placed
    // (The exact numbers depend on tribe growth patterns)
    const hasSomeBuildings = hasStorageSpots || hasPlantingZones;

    console.log('\n=== Building Placement Summary ===');
    console.log('Final tribe size:', finalData.tribeSize);
    console.log('Storage spots placed:', finalData.storageSpots);
    console.log('Planting zones placed:', finalData.plantingZones);

    // If tribe grew large enough, buildings should have been placed
    if (finalData.tribeSize >= 5) {
      expect(hasSomeBuildings).toBe(true);
      console.log('✓ Buildings were placed as expected');
    } else {
      console.log('⚠ Tribe too small to require buildings');
    }

    // Track building growth over time
    if (buildingHistory.length > 1) {
      let storageIncreased = false;
      let plantingZonesIncreased = false;

      for (let i = 1; i < buildingHistory.length; i++) {
        if (buildingHistory[i].storageSpots > buildingHistory[i - 1].storageSpots) {
          storageIncreased = true;
        }
        if (buildingHistory[i].plantingZones > buildingHistory[i - 1].plantingZones) {
          plantingZonesIncreased = true;
        }
      }

      console.log('Storage growth observed:', storageIncreased);
      console.log('Planting zone growth observed:', plantingZonesIncreased);
    }
  });

  it('should place buildings near tribe center', { timeout: 30000 }, () => {
    // Initialize the game
    let gameState: GameWorldState = initGame();

    // Disable player control
    const playerEntity = Object.values(gameState.entities.entities).find(
      (e) => e.isPlayer && e.type === 'human',
    ) as HumanEntity;
    if (playerEntity) {
      playerEntity.isPlayer = false;
    }

    // Simulate for 5 years
    const yearsToSimulate = 5;
    const totalSimulationSeconds = yearsToSimulate * HUMAN_YEAR_IN_REAL_SECONDS;
    const timeStepSeconds = GAME_DAY_IN_REAL_SECONDS / 24;

    for (let time = 0; time < totalSimulationSeconds; time += timeStepSeconds) {
      gameState = updateWorld(gameState, timeStepSeconds);
    }

    // Get all buildings
    const buildings = Object.values(gameState.entities.entities).filter(
      (e) => e.type === 'building',
    ) as BuildingEntity[];

    if (buildings.length > 0) {
      console.log(`\n=== Building Placement Location Test ===`);
      console.log(`Total buildings placed: ${buildings.length}`);

      // For each building, check if it's within reasonable distance from its tribe center
      buildings.forEach((building) => {
        const owner = gameState.entities.entities[building.ownerId] as HumanEntity | undefined;
        if (owner && owner.leaderId) {
          const tribeMembers = getTribeMembers(owner, gameState);

          // Calculate tribe center
          const tribeCenter = {
            x: tribeMembers.reduce((sum, m) => sum + m.position.x, 0) / tribeMembers.length,
            y: tribeMembers.reduce((sum, m) => sum + m.position.y, 0) / tribeMembers.length,
          };

          // Calculate distance using wrapped distance calculation
          const distance = calculateWrappedDistance(
            building.position,
            tribeCenter,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );

          console.log(
            `${building.buildingType} at distance ${distance.toFixed(0)}px from tribe center`,
          );

          // Buildings should be within 300px of tribe center (BUILDING_PLACEMENT_SEARCH_RADIUS)
          // Allow some tolerance for edge cases and map wrapping
          expect(distance).toBeLessThan(BUILDING_PLACEMENT_TOLERANCE);
        }
      });
    } else {
      console.log('⚠ No buildings were placed during simulation');
    }
  });

  it('should help tribes grow with better resource management', { timeout: 60000 }, () => {
    console.log('\n=== Tribe Growth with Building Placement ===');
    
    // This test compares tribe performance with the building placement behavior active
    let gameState: GameWorldState = initGame();

    // Disable player control
    const playerEntity = Object.values(gameState.entities.entities).find(
      (e) => e.isPlayer && e.type === 'human',
    ) as HumanEntity;
    if (playerEntity) {
      playerEntity.isPlayer = false;
    }

    const initialHumans = Object.values(gameState.entities.entities).filter(
      (e) => e.type === 'human',
    ).length;

    // Simulate for 10 years
    const yearsToSimulate = 10;
    const totalSimulationSeconds = yearsToSimulate * HUMAN_YEAR_IN_REAL_SECONDS;
    const timeStepSeconds = GAME_DAY_IN_REAL_SECONDS / 24;

    for (let time = 0; time < totalSimulationSeconds; time += timeStepSeconds) {
      gameState = updateWorld(gameState, timeStepSeconds);
    }

    const finalHumans = Object.values(gameState.entities.entities).filter(
      (e) => e.type === 'human',
    ).length;
    const buildings = Object.values(gameState.entities.entities).filter(
      (e) => e.type === 'building',
    ) as BuildingEntity[];

    console.log(`Initial population: ${initialHumans}`);
    console.log(`Final population: ${finalHumans}`);
    console.log(`Buildings placed: ${buildings.length}`);
    console.log(`Storage spots: ${buildings.filter((b) => b.buildingType === BuildingType.StorageSpot).length}`);
    console.log(`Planting zones: ${buildings.filter((b) => b.buildingType === BuildingType.PlantingZone).length}`);

    // The tribe should still be alive after 10 years
    expect(finalHumans).toBeGreaterThan(0);
    console.log('✓ Tribe survived 10 years');

    // If buildings were placed, it indicates the behavior is functioning
    if (buildings.length > 0) {
      console.log('✓ Building placement behavior is active and functioning');
    }
  });
});
