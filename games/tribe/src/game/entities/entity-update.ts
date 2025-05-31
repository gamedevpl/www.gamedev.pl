import { UpdateContext } from "../world-types";
import { stateUpdate } from "../state-machine/state-machine-update";
import { vectorScale, vectorAdd, vectorLength, vectorNormalize } from "../utils/math-utils";
import { Entity } from "./entities-types";
import { humanUpdate } from "./characters/human/human-update";
import { HumanEntity } from "./characters/human/human-types";

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

    if (debuffElapsed < debuff.duration && debuff.type === "slow") {
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

  // Zero velocity if it"s too small to prevent drifting
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

  // Update state machine if present
  if (entity.stateMachine) {
    entity.stateMachine = stateUpdate(...entity.stateMachine, { entity, updateContext });
  }

  if (entity.type === "human") {
    // Pass the full updateContext and deltaTime to humanUpdate
    humanUpdate(entity as HumanEntity, updateContext, updateContext.deltaTime);
  }
}
