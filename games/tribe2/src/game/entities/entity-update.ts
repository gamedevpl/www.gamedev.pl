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

export function entityUpdate(entity: Entity, updateContext: UpdateContext) {
  // Optimization: Skip physics for static entities (buildings, berry bushes, corpses with zero velocity)
  const isStaticEntity = entity.type === 'berryBush' || entity.type === 'building';
  const hasMovement = entity.velocity.x !== 0 || entity.velocity.y !== 0 || entity.acceleration !== 0;
  
  if (!isStaticEntity || hasMovement) {
    // Apply friction/damping
    entity.forces.push(vectorScale(entity.velocity, -0.1));

    // Apply acceleration force based on direction
    const accelerationForce = vectorScale(vectorNormalize(entity.direction), entity.acceleration);
    entity.forces.push(accelerationForce);

    // Optimization: Only process debuffs if there are any
    if (entity.debuffs.length > 0) {
      const currentTime = updateContext.gameState.time;
      
      // Process each active debuff
      entity.debuffs.forEach((debuff) => {
        const debuffElapsed = currentTime - debuff.startTime;

        if (debuffElapsed < debuff.duration && debuff.type === 'slow') {
          // Apply debuff effect - currently all debuffs reduce velocity by 50%
          // Multiple debuffs stack multiplicatively
          entity.velocity = vectorScale(entity.velocity, 0.5);
        }
      });

      // Clean up expired debuffs
      entity.debuffs = entity.debuffs.filter((debuff) => {
        const debuffElapsed = currentTime - debuff.startTime;
        return debuffElapsed < debuff.duration;
      });
    }

    // Apply accumulated forces to velocity
    entity.velocity = vectorAdd(entity.velocity, entity.forces.reduce(vectorAdd, { x: 0, y: 0 }));

    // Optimization: Cache velocity length to avoid recalculation
    const velocityMagnitude = vectorLength(entity.velocity);
    
    // Zero velocity if it's too small to prevent drifting
    if (velocityMagnitude < 0.001) {
      entity.velocity = { x: 0, y: 0 };
    }

    // Update position based on velocity
    if (velocityMagnitude >= 0.001) {
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
    }

    // Reset forces for the next frame
    entity.forces = [];
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
