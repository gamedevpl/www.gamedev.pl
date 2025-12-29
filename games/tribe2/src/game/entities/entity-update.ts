import { UpdateContext } from '../world-types';
import { stateUpdate } from '../state-machine/state-machine-update';
import { vectorScale, vectorAdd, vectorLength, vectorNormalize } from '../utils/math-utils';
import { Entity } from './entities-types';
import { humanUpdate } from './characters/human/human-update';
import { corpseUpdate } from './characters/corpse-update';
import { preyUpdate } from './characters/prey/prey-update';
import { predatorUpdate } from './characters/predator/predator-update';
import { CorpseEntity } from './characters/corpse-types';
import { HumanEntity } from './characters/human/human-types';
import { PreyEntity } from './characters/prey/prey-types';
import { PredatorEntity } from './characters/predator/predator-types';
import { humanAIUpdate } from '../ai/human-ai-update';
import { preyAIUpdate, predatorAIUpdate } from '../ai/animal-ai-update';
import { buildingUpdate } from './buildings/building-update';
import { BuildingEntity } from './buildings/building-types';
import { applySoilWalkDepletion } from './plants/soil-depletion-update';
import { treeUpdate } from './plants/tree/tree-update';
import { TreeEntity } from './plants/tree/tree-types';
import { updatePlantTaskAI } from '../ai/task/plants/plant-task-update';
import { updateCorpseTaskAI } from '../ai/task/corpse/corpse-task-update';
import { updateAnimalTaskAI } from '../ai/task/animals/animal-task-update';
import { BerryBushEntity } from './plants/berry-bush/berry-bush-types';
import { updateBuildingTaskAI } from '../ai/task/buildings/building-task-update';

export function entityUpdate(entity: Entity, updateContext: UpdateContext) {
  // Apply friction/damping
  entity.forces.push(vectorScale(entity.velocity, -0.1));

  // Boundary forces are removed as the world now wraps
  // const boundaryForce = calculateBoundaryForce(entity.position, BOUNDARY_FORCE_RANGE, BOUNDARY_FORCE_STRENGTH);
  // entity.forces.push(boundaryForce);

  // Apply acceleration force based on direction
  const accelerationForce = vectorScale(vectorNormalize(entity.direction), entity.acceleration);
  entity.forces.push(accelerationForce);

  // Process each active debuff
  entity.debuffs.forEach((debuff) => {
    const debuffElapsed = updateContext.gameState.time - debuff.startTime;

    if (debuffElapsed < debuff.duration && debuff.type === 'slow') {
      // Apply debuff effect - currently all debuffs reduce velocity by 50%
      // Multiple debuffs stack multiplicatively
      entity.velocity = vectorScale(entity.velocity, 0.5);
    }
  });

  // Clean up expired debuffs
  entity.debuffs = entity.debuffs.filter((debuff) => {
    const debuffElapsed = updateContext.gameState.time - debuff.startTime;
    return debuffElapsed < debuff.duration;
  });

  // Apply accumulated forces to velocity
  entity.velocity = vectorAdd(entity.velocity, entity.forces.reduce(vectorAdd, { x: 0, y: 0 }));

  // Zero velocity if it's too small to prevent drifting
  if (vectorLength(entity.velocity) < 0.001) {
    entity.velocity = { x: 0, y: 0 };
  }

  // Update position based on velocity
  entity.position = vectorAdd(entity.position, vectorScale(entity.velocity, updateContext.deltaTime));

  // --- World Wrapping ---
  // Ensure the entity position wraps around the world boundaries
  entity.position.x =
    ((entity.position.x % updateContext.gameState.mapDimensions.width) + updateContext.gameState.mapDimensions.width) %
    updateContext.gameState.mapDimensions.width;
  entity.position.y =
    ((entity.position.y % updateContext.gameState.mapDimensions.height) +
      updateContext.gameState.mapDimensions.height) %
    updateContext.gameState.mapDimensions.height;
  // --- End World Wrapping ---

  // Reset forces for the next frame
  entity.forces = [];

  // Apply soil depletion when humans are walking (moving with significant velocity)
  if (entity.type === 'human' && vectorLength(entity.velocity) > 0.1) {
    applySoilWalkDepletion(
      updateContext.gameState.soilDepletion,
      entity.position,
      entity.id,
      updateContext.gameState.time,
      updateContext.gameState.mapDimensions.width,
      updateContext.gameState.mapDimensions.height,
      updateContext.gameState,
    );
  }

  // Specific entity type updates (e.g., physiological changes)
  if (entity.type === 'human') {
    // Pass the full updateContext and deltaTime to humanUpdate
    humanUpdate(entity as HumanEntity, updateContext, updateContext.deltaTime);
  } else if (entity.type === 'corpse') {
    corpseUpdate(entity as CorpseEntity, updateContext);
    updateCorpseTaskAI(entity as CorpseEntity, updateContext);
  } else if (entity.type === 'prey') {
    preyUpdate(entity as PreyEntity, updateContext, updateContext.deltaTime);
    updateAnimalTaskAI(entity as PreyEntity, updateContext);
  } else if (entity.type === 'predator') {
    predatorUpdate(entity as PredatorEntity, updateContext, updateContext.deltaTime);
    updateAnimalTaskAI(entity as PredatorEntity, updateContext);
  } else if (entity.type === 'building') {
    buildingUpdate(entity as BuildingEntity, updateContext);
    updateBuildingTaskAI(entity as BuildingEntity, updateContext);
  } else if (entity.type === 'tree') {
    treeUpdate(entity as TreeEntity, updateContext);
    updatePlantTaskAI(entity as TreeEntity, updateContext);
  } else if (entity.type === 'berryBush') {
    updatePlantTaskAI(entity as BerryBushEntity, updateContext);
  }

  // AI decision making for all humans (player and non-player)
  if (entity.type === 'human') {
    humanAIUpdate(entity as HumanEntity, updateContext);
  }

  // AI decision making for animals
  if (entity.type === 'prey') {
    preyAIUpdate(entity as PreyEntity, updateContext);
  } else if (entity.type === 'predator') {
    predatorAIUpdate(entity as PredatorEntity, updateContext);
  }

  // Update state machine if present
  if (entity.stateMachine) {
    entity.stateMachine = stateUpdate(...entity.stateMachine, { entity, updateContext });
  }
}
