import { UpdateContext } from '../world-types';
import { stateUpdate } from '../state-machine/state-machine-update';
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
import { preparePlantTaskAI } from '../ai/task/plants/plant-task-update';
import { prepareCorpseTaskAI } from '../ai/task/corpse/corpse-task-update';
import { prepareAnimalTaskAI } from '../ai/task/animals/animal-task-update';
import { BerryBushEntity } from './plants/berry-bush/berry-bush-types';
import { prepareBuildingTaskAI } from '../ai/task/buildings/building-task-update';
import { prepareHumanTaskAI } from '../ai/task/humans/human-task-update';
import { Blackboard } from '../ai/behavior-tree/behavior-tree-blackboard';
import { AI_UPDATE_INTERVAL } from '../ai-consts';

export enum EntityUpdatePhase {
  Physics,
  PrepareAI,
  ExecuteAI,
}

export function entityUpdate(entity: Entity, updateContext: UpdateContext, phase: EntityUpdatePhase) {
  switch (phase) {
    case EntityUpdatePhase.Physics:
      entityPhysicsUpdate(entity, updateContext);
      break;
    case EntityUpdatePhase.PrepareAI:
      prepareEntityAIUpdate(entity, updateContext);
      break;
    case EntityUpdatePhase.ExecuteAI:
      executeEntityAIUpdate(entity, updateContext);
      break;
  }
}

function entityPhysicsUpdate(entity: Entity, updateContext: UpdateContext) {
  // Apply friction/damping - inline to avoid object allocation
  const frictionX = entity.velocity.x * -0.1;
  const frictionY = entity.velocity.y * -0.1;

  // Apply acceleration force based on direction - inline normalization
  const dirLength = Math.sqrt(entity.direction.x * entity.direction.x + entity.direction.y * entity.direction.y);
  let accelX = 0;
  let accelY = 0;
  if (dirLength > 0) {
    accelX = (entity.direction.x / dirLength) * entity.acceleration;
    accelY = (entity.direction.y / dirLength) * entity.acceleration;
  }

  // Accumulate all forces into total force - avoid creating intermediate objects
  let totalForceX = frictionX + accelX;
  let totalForceY = frictionY + accelY;

  // Add all accumulated forces
  for (let i = 0; i < entity.forces.length; i++) {
    totalForceX += entity.forces[i].x;
    totalForceY += entity.forces[i].y;
  }

  // Process each active debuff
  const currentTime = updateContext.gameState.time;
  let velocityMultiplier = 1.0;
  let hasActiveDebuff = false;
  for (let i = 0; i < entity.debuffs.length; i++) {
    const debuff = entity.debuffs[i];
    const debuffElapsed = currentTime - debuff.startTime;
    if (debuffElapsed < debuff.duration && debuff.type === 'slow') {
      velocityMultiplier *= 0.5;
      hasActiveDebuff = true;
    }
  }

  // Apply velocity multiplier from debuffs
  if (hasActiveDebuff) {
    entity.velocity.x *= velocityMultiplier;
    entity.velocity.y *= velocityMultiplier;
  }

  // Clean up expired debuffs - only if there are debuffs
  if (entity.debuffs.length > 0) {
    entity.debuffs = entity.debuffs.filter((debuff) => {
      const debuffElapsed = currentTime - debuff.startTime;
      return debuffElapsed < debuff.duration;
    });
  }

  // Apply accumulated forces to velocity - inline to avoid object allocation
  entity.velocity.x += totalForceX;
  entity.velocity.y += totalForceY;

  // Zero velocity if it's too small to prevent drifting
  const velLengthSq = entity.velocity.x * entity.velocity.x + entity.velocity.y * entity.velocity.y;
  if (velLengthSq < 0.000001) {
    entity.velocity.x = 0;
    entity.velocity.y = 0;
  }

  // Update position based on velocity - inline to avoid object allocation
  entity.position.x += entity.velocity.x * updateContext.deltaTime;
  entity.position.y += entity.velocity.y * updateContext.deltaTime;

  // --- World Wrapping ---
  // Ensure the entity position wraps around the world boundaries
  const mapWidth = updateContext.gameState.mapDimensions.width;
  const mapHeight = updateContext.gameState.mapDimensions.height;
  entity.position.x = ((entity.position.x % mapWidth) + mapWidth) % mapWidth;
  entity.position.y = ((entity.position.y % mapHeight) + mapHeight) % mapHeight;
  // --- End World Wrapping ---

  // Reset forces for the next frame - reuse array if possible
  entity.forces.length = 0;

  // Apply soil depletion when humans are walking (moving with significant velocity)
  if (entity.type === 'human' && velLengthSq > 0.01) {
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
  } else if (entity.type === 'prey') {
    preyUpdate(entity as PreyEntity, updateContext, updateContext.deltaTime);
  } else if (entity.type === 'predator') {
    predatorUpdate(entity as PredatorEntity, updateContext, updateContext.deltaTime);
  } else if (entity.type === 'building') {
    buildingUpdate(entity as BuildingEntity, updateContext);
  } else if (entity.type === 'tree') {
    treeUpdate(entity as TreeEntity, updateContext);
  } else if (entity.type === 'berryBush') {
    // no physics update needed for berry bush, handled by state machine
  }

  // Update state machine if present
  if (entity.stateMachine) {
    entity.stateMachine = stateUpdate(...entity.stateMachine, { entity, updateContext });
  }
}

function prepareEntityAIUpdate(entity: Entity, updateContext: UpdateContext) {
  if (!shouldUpdateAI(entity, updateContext)) {
    return;
  }

  if (entity.type === 'human') {
    prepareHumanTaskAI(entity as HumanEntity, updateContext);
  } else if (entity.type === 'corpse') {
    prepareCorpseTaskAI(entity as CorpseEntity, updateContext);
  } else if (entity.type === 'prey') {
    prepareAnimalTaskAI(entity as PreyEntity, updateContext);
  } else if (entity.type === 'predator') {
    prepareAnimalTaskAI(entity as PredatorEntity, updateContext);
  } else if (entity.type === 'building') {
    prepareBuildingTaskAI(entity as BuildingEntity, updateContext);
  } else if (entity.type === 'tree') {
    preparePlantTaskAI(entity as TreeEntity, updateContext);
  } else if (entity.type === 'berryBush') {
    preparePlantTaskAI(entity as BerryBushEntity, updateContext);
  }
}

function executeEntityAIUpdate(entity: Entity, updateContext: UpdateContext) {
  if (!shouldUpdateAI(entity, updateContext)) {
    return;
  }

  Blackboard.cleanupOldEntries(entity.aiBlackboard, updateContext.gameState.time);

  if (entity.type === 'human') {
    humanAIUpdate(entity as HumanEntity, updateContext);
  } else if (entity.type === 'corpse') {
    // Corpses currently have no active AI execution phase
  } else if (entity.type === 'prey') {
    preyAIUpdate(entity as PreyEntity, updateContext);
  } else if (entity.type === 'predator') {
    predatorAIUpdate(entity as PredatorEntity, updateContext);
  } else if (entity.type === 'building') {
    // Buildings currently have no active AI execution phase
  } else if (entity.type === 'tree') {
    // Trees currently have no active AI execution phase
  } else if (entity.type === 'berryBush') {
    // Berry bushes currently have no active AI execution phase
  }

  Blackboard.set(entity.aiBlackboard, 'lastAiUpdateTime', updateContext.gameState.time);
}

function shouldUpdateAI(entity: Entity, updateContext: UpdateContext): boolean {
  const lastAiUpdateTime: number = Blackboard.get(entity.aiBlackboard, 'lastAiUpdateTime') ?? 0;
  return (
    updateContext.gameState.time - lastAiUpdateTime + ((Math.random() - Math.random()) * AI_UPDATE_INTERVAL) / 10 >
    AI_UPDATE_INTERVAL
  );
}
