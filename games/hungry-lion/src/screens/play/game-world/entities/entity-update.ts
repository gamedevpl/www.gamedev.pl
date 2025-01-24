import { BOUNDARY_FORCE_RANGE, BOUNDARY_FORCE_STRENGTH } from '../game-world-consts';
import { UpdateContext } from '../game-world-types';
import { stateUpdate } from '../state-machine/state-machine-update';
import { vectorScale, calculateBoundaryForce, vectorAdd, vectorLength } from '../utils/math-utils';
import { Entity } from './entities-types';

export function entityUpdate(entity: Entity, updateContext: UpdateContext) {
  entity.forces.push(vectorScale(entity.velocity, -0.1));

  // boundary forces
  const boundaryForce = calculateBoundaryForce(entity.position, BOUNDARY_FORCE_RANGE, BOUNDARY_FORCE_STRENGTH);
  entity.forces.push(boundaryForce);

  const accelerationForce = vectorScale(
    { x: Math.cos(entity.direction), y: Math.sin(entity.direction) },
    entity.acceleration,
  );
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

  // Clean up expired debuffs in a separate pass to avoid modifying the map during iteration
  entity.debuffs = entity.debuffs.filter((debuff) => {
    const debuffElapsed = updateContext.gameState.time - debuff.startTime;
    return debuffElapsed < debuff.duration;
  });

  entity.velocity = vectorAdd(entity.velocity, entity.forces.reduce(vectorAdd, { x: 0, y: 0 }));
  // TODO: Introduce angular velocity
  entity.direction = entity.targetDirection;

  // zero velocity if it's too small
  if (vectorLength(entity.velocity) < 0.001) {
    entity.velocity = { x: 0, y: 0 };
  }

  entity.position = vectorAdd(entity.position, vectorScale(entity.velocity, updateContext.deltaTime));

  entity.forces = [];

  if (entity.stateMachine) {
    entity.stateMachine = stateUpdate(...entity.stateMachine, { entity, updateContext });
  }
}
