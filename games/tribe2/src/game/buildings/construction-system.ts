/**
 * Construction system for Tribe2
 * 
 * Handles automatic job assignment for construction, progress tracking,
 * and building state transitions during construction.
 */

import { IndexedWorldState } from '../world-index/world-index-types';
import { BuildingEntity } from '../entities/buildings/building-entity';
import { BuildingState } from './building-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { ProfessionType, JobState } from '../jobs/job-types';
import { getBuildingDefinition } from './building-definitions';

// Construction constants
const MAX_CONSTRUCTORS_PER_BUILDING = 3;
const CONSTRUCTION_WORK_RATE = 5; // Progress points per hour per worker
const CONSTRUCTION_ASSIGNMENT_RANGE = 100; // How close workers need to be to be assigned

/**
 * Updates all buildings in construction state
 * Assigns workers, tracks progress, and handles state transitions
 */
export function updateConstruction(gameState: IndexedWorldState, deltaTime: number): void {
  // Get all buildings that need construction
  const plannedBuildings: BuildingEntity[] = [];
  const underConstructionBuildings: BuildingEntity[] = [];
  
  for (const building of gameState.buildings.values()) {
    if (building.state === BuildingState.Planned) {
      plannedBuildings.push(building);
    } else if (building.state === BuildingState.UnderConstruction) {
      underConstructionBuildings.push(building);
    }
  }
  
  // Assign constructors to planned buildings
  for (const building of plannedBuildings) {
    assignConstructorsToBuilding(gameState, building);
  }
  
  // Update construction progress for buildings under construction
  for (const building of underConstructionBuildings) {
    updateBuildingConstructionProgress(gameState, building, deltaTime);
  }
}

/**
 * Assigns idle adult tribe members to construction jobs for a building
 */
function assignConstructorsToBuilding(gameState: IndexedWorldState, building: BuildingEntity): void {
  // Count current constructors assigned to this building
  let currentConstructors = 0;
  for (const workerId of building.assignedWorkerIds) {
    const worker = gameState.entities.entities.get(workerId) as HumanEntity;
    if (worker && worker.jobAssignment?.profession === ProfessionType.BuildingConstructor) {
      currentConstructors++;
    }
  }
  
  // If we have enough constructors, transition to UnderConstruction state
  if (currentConstructors > 0 && building.state === BuildingState.Planned) {
    building.state = BuildingState.UnderConstruction;
    building.constructionStartTime = gameState.time;
    building.constructionProgress = 0;
    return;
  }
  
  // Need more constructors?
  if (currentConstructors >= MAX_CONSTRUCTORS_PER_BUILDING) {
    return;
  }
  
  // Find idle adults who can become constructors
  const idleAdults: HumanEntity[] = [];
  
  for (const entity of gameState.entities.entities.values()) {
    if (entity.type !== 'human') continue;
    
    const human = entity as HumanEntity;
    
    // Must be adult and not already employed
    if (!human.isAdult) continue;
    if (human.jobAssignment && human.jobAssignment.profession !== ProfessionType.None) continue;
    
    // Calculate distance to building (considering toroidal world)
    const dx = Math.abs(human.position.x - building.position.x);
    const dy = Math.abs(human.position.y - building.position.y);
    const wrappedDx = Math.min(dx, gameState.mapDimensions.width - dx);
    const wrappedDy = Math.min(dy, gameState.mapDimensions.height - dy);
    const distance = Math.sqrt(wrappedDx * wrappedDx + wrappedDy * wrappedDy);
    
    // Prefer nearby workers
    if (distance < CONSTRUCTION_ASSIGNMENT_RANGE) {
      idleAdults.push(human);
    }
  }
  
  // Sort by distance to building
  idleAdults.sort((a, b) => {
    const distA = Math.sqrt(
      Math.pow(a.position.x - building.position.x, 2) + 
      Math.pow(a.position.y - building.position.y, 2)
    );
    const distB = Math.sqrt(
      Math.pow(b.position.x - building.position.x, 2) + 
      Math.pow(b.position.y - building.position.y, 2)
    );
    return distA - distB;
  });
  
  // Assign workers up to the limit
  const workersNeeded = MAX_CONSTRUCTORS_PER_BUILDING - currentConstructors;
  const workersToAssign = idleAdults.slice(0, workersNeeded);
  
  for (const worker of workersToAssign) {
    // Assign constructor profession
    worker.jobAssignment = {
      profession: ProfessionType.BuildingConstructor,
      buildingId: building.id,
      jobState: JobState.Idle,
    };
    
    // Add to building's worker list
    building.assignedWorkerIds.push(worker.id);
  }
}

/**
 * Updates construction progress for a building based on assigned workers
 */
function updateBuildingConstructionProgress(
  gameState: IndexedWorldState,
  building: BuildingEntity,
  deltaTime: number
): void {
  // Count active constructors
  let activeConstructors = 0;
  
  for (const workerId of building.assignedWorkerIds) {
    const worker = gameState.entities.entities.get(workerId) as HumanEntity;
    if (!worker) continue;
    
    if (worker.jobAssignment?.profession === ProfessionType.BuildingConstructor &&
        worker.jobAssignment?.buildingId === building.id) {
      activeConstructors++;
      
      // Update worker job state to Constructing
      if (worker.jobAssignment.jobState === JobState.Idle) {
        worker.jobAssignment.jobState = JobState.Constructing;
      }
    }
  }
  
  // No workers? Stop construction
  if (activeConstructors === 0) {
    return;
  }
  
  // Calculate progress increase
  // Progress is 0-100, construction time is in game hours
  const definition = getBuildingDefinition(building.buildingType);
  const gameHoursDelta = deltaTime * (24 / 86400); // Convert real seconds to game hours
  const progressPerHour = (100 / definition.constructionTime) * activeConstructors;
  const progressIncrease = progressPerHour * gameHoursDelta;
  
  building.constructionProgress = Math.min(100, building.constructionProgress + progressIncrease);
  
  // Check if construction is complete
  if (building.constructionProgress >= 100) {
    completeConstruction(gameState, building);
  }
}

/**
 * Completes construction of a building
 */
function completeConstruction(gameState: IndexedWorldState, building: BuildingEntity): void {
  // Transition to Operational state
  building.state = BuildingState.Operational;
  building.constructionProgress = 100;
  building.health = building.maxHealth;
  
  // Release constructors back to idle
  for (const workerId of building.assignedWorkerIds) {
    const worker = gameState.entities.entities.get(workerId) as HumanEntity;
    if (worker && worker.jobAssignment?.profession === ProfessionType.BuildingConstructor) {
      worker.jobAssignment = {
        profession: ProfessionType.None,
        jobState: JobState.Idle,
      };
    }
  }
  
  // Clear worker assignments from this building
  building.assignedWorkerIds = [];
  
  // TODO: Play construction complete sound/effect
  // TODO: Add notification about building completion
}
