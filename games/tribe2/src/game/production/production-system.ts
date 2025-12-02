/**
 * Production system - handles resource transformation in production buildings
 * 
 * This system manages the production cycle where buildings consume input resources
 * and produce output resources over time based on worker assignment and production rates.
 */

import { IndexedWorldState } from '../world-index/world-index-types';
import { BuildingState } from '../buildings/building-types';
import { getBuildingDefinition } from '../buildings/building-definitions';
import { ResourceType } from '../buildings/building-types';
import {
  getResourceAmount,
  removeResourcesFromBuilding,
  addResourcesToBuilding,
} from '../resources/resource-management';
import { ProfessionType, JobState } from '../jobs/job-types';
import { HumanEntity } from '../entities/characters/human/human-types';

/**
 * Production recipe - defines how a building transforms resources
 */
interface ProductionRecipe {
  inputs: { resourceType: ResourceType; amount: number }[];
  outputs: { resourceType: ResourceType; amount: number }[];
  productionTime: number; // Game hours to complete one production cycle
}

/**
 * Production recipes for different building types
 */
const PRODUCTION_RECIPES: Record<string, ProductionRecipe> = {
  Sawmill: {
    inputs: [{ resourceType: ResourceType.Wood, amount: 2 }],
    outputs: [{ resourceType: ResourceType.WoodPlanks, amount: 1 }],
    productionTime: 1, // 1 game hour
  },
  Windmill: {
    inputs: [{ resourceType: ResourceType.Wheat, amount: 3 }],
    outputs: [{ resourceType: ResourceType.Flour, amount: 2 }],
    productionTime: 2,
  },
  Bakery: {
    inputs: [{ resourceType: ResourceType.Flour, amount: 2 }],
    outputs: [{ resourceType: ResourceType.Bread, amount: 3 }],
    productionTime: 1.5,
  },
  Butcher: {
    inputs: [{ resourceType: ResourceType.Pigs, amount: 1 }],
    outputs: [{ resourceType: ResourceType.Sausage, amount: 4 }],
    productionTime: 2,
  },
  Blacksmith: {
    inputs: [{ resourceType: ResourceType.Iron, amount: 1 }],
    outputs: [{ resourceType: ResourceType.Tools, amount: 1 }],
    productionTime: 3,
  },
  ToolMaker: {
    inputs: [{ resourceType: ResourceType.Iron, amount: 1 }],
    outputs: [{ resourceType: ResourceType.Tools, amount: 2 }],
    productionTime: 2,
  },
  IronFoundry: {
    inputs: [{ resourceType: ResourceType.IronOre, amount: 2 }],
    outputs: [{ resourceType: ResourceType.Iron, amount: 1 }],
    productionTime: 4,
  },
  GoldFoundry: {
    inputs: [{ resourceType: ResourceType.GoldOre, amount: 2 }],
    outputs: [{ resourceType: ResourceType.Gold, amount: 1 }],
    productionTime: 5,
  },
};

/**
 * Assign workers to operational production buildings
 */
function assignProductionWorkers(gameState: IndexedWorldState): void {
  // Find all operational buildings that need workers
  const productionBuildings = Array.from(gameState.buildings.values()).filter(
    (building) =>
      building.state === BuildingState.Operational &&
      getBuildingDefinition(building.buildingType).maxWorkers > 0 &&
      building.assignedWorkerIds.length < getBuildingDefinition(building.buildingType).maxWorkers
  );

  // Find idle adults
  const idleAdults: HumanEntity[] = [];
  for (const entity of gameState.entities.entities.values()) {
    if (entity.type !== 'human') continue;
    
    const human = entity as HumanEntity;
    if (!human.isAdult) continue;
    if (human.jobAssignment && human.jobAssignment.profession !== ProfessionType.None) continue;
    
    idleAdults.push(human);
  }

  // Assign workers to buildings
  for (const building of productionBuildings) {
    const definition = getBuildingDefinition(building.buildingType);
    const neededWorkers = definition.maxWorkers - building.assignedWorkerIds.length;

    if (neededWorkers <= 0) continue;

    // Find nearest idle workers (considering toroidal world)
    const nearbyWorkers = idleAdults
      .filter((worker) => {
        const dx = Math.abs(worker.position.x - building.position.x);
        const dy = Math.abs(worker.position.y - building.position.y);
        const wrappedDx = Math.min(dx, gameState.mapDimensions.width - dx);
        const wrappedDy = Math.min(dy, gameState.mapDimensions.height - dy);
        const distance = Math.sqrt(wrappedDx * wrappedDx + wrappedDy * wrappedDy);
        return distance < 200; // Within 200 units
      })
      .sort((a, b) => {
        const calcDist = (worker: HumanEntity) => {
          const dx = Math.abs(worker.position.x - building.position.x);
          const dy = Math.abs(worker.position.y - building.position.y);
          const wrappedDx = Math.min(dx, gameState.mapDimensions.width - dx);
          const wrappedDy = Math.min(dy, gameState.mapDimensions.height - dy);
          return Math.sqrt(wrappedDx * wrappedDx + wrappedDy * wrappedDy);
        };
        return calcDist(a) - calcDist(b);
      })
      .slice(0, neededWorkers);

    // Assign workers
    for (const worker of nearbyWorkers) {
      worker.jobAssignment = {
        profession: getProfessionForBuilding(building.buildingType),
        buildingId: building.id,
        jobState: JobState.Idle,
        assignedTime: gameState.time,
      };
      building.assignedWorkerIds.push(worker.id);

      // Remove from idle list
      const index = idleAdults.indexOf(worker);
      if (index > -1) {
        idleAdults.splice(index, 1);
      }
    }
  }
}

/**
 * Get the profession type for a given building type
 */
function getProfessionForBuilding(buildingType: string): ProfessionType {
  const professionMap: Record<string, ProfessionType> = {
    Sawmill: ProfessionType.SawmillWorker,
    Windmill: ProfessionType.WindmillWorker,
    Bakery: ProfessionType.Baker,
    Butcher: ProfessionType.Butcher,
    Blacksmith: ProfessionType.Blacksmith,
    ToolMaker: ProfessionType.ToolMaker,
    IronFoundry: ProfessionType.IronFoundryWorker,
    GoldFoundry: ProfessionType.GoldFoundryWorker,
    LumberjackHut: ProfessionType.Lumberjack,
    ForestRangerHut: ProfessionType.ForestRanger,
    FishermanHut: ProfessionType.Fisherman,
    HunterHut: ProfessionType.Hunter,
    Farm: ProfessionType.Farmer,
    PigFarm: ProfessionType.PigFarmer,
    Tavern: ProfessionType.TavernWorker,
    Kindergarten: ProfessionType.KindergartenCaretaker,
  };
  return professionMap[buildingType] || ProfessionType.None;
}

/**
 * Update production for all operational buildings
 */
function updateProduction(gameState: IndexedWorldState, deltaTime: number): void {
  const gameSpeed = 1; // Default game speed
  const gameHoursPassed = (deltaTime / 1000) * gameSpeed * (24 / 86400);

  // Process each operational building
  for (const building of gameState.buildings.values()) {
    if (building.state !== BuildingState.Operational) continue;

    const recipe = PRODUCTION_RECIPES[building.buildingType];
    if (!recipe) continue; // No production recipe for this building

    const workerCount = building.assignedWorkerIds.length;
    if (workerCount === 0) continue; // No workers, no production

    // Initialize production progress if needed
    if (building.productionProgress === undefined) {
      building.productionProgress = 0;
    }

    // Check if we have enough input resources
    const hasInputs = recipe.inputs.every((input) =>
      getResourceAmount(building, input.resourceType, true) >= input.amount
    );

    if (!hasInputs) {
      // Not enough resources, reset progress
      building.productionProgress = 0;
      continue;
    }

    // Increase production progress based on time and worker count
    const progressIncrease = (gameHoursPassed / recipe.productionTime) * 100 * workerCount;
    building.productionProgress += progressIncrease;

    // Check if production cycle is complete
    if (building.productionProgress >= 100) {
      // Consume input resources
      for (const input of recipe.inputs) {
        removeResourcesFromBuilding(building, input.resourceType, input.amount, true);
      }

      // Produce output resources
      for (const output of recipe.outputs) {
        addResourcesToBuilding(building, output.resourceType, output.amount, false);
      }

      // Reset progress for next cycle
      building.productionProgress = 0;
    }
  }
}

/**
 * Main update function called each frame
 */
export function updateProductionSystem(gameState: IndexedWorldState, deltaTime: number): void {
  // Assign workers to production buildings
  assignProductionWorkers(gameState);

  // Update production cycles
  updateProduction(gameState, deltaTime);
}
