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
  // Apply friction/damping
  entity.forces.push(vectorScale(entity.velocity, -0.1));

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
