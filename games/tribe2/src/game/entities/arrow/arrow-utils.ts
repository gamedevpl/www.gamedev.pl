import { Entities, EntityId } from '../entities-types';
import { Vector2D } from '../../utils/math-types';
import { ArrowEntity } from './arrow-types';
import {
  ARROW_BASE_DAMAGE,
  ARROW_SPEED,
  ARROW_INITIAL_HEIGHT,
  ARROW_COLLISION_RADIUS,
  ARROW_MIN_FLIGHT_TIME_SECONDS,
} from './arrow-consts';
import { getDirectionVectorOnTorus, vectorLength } from '../../utils/math-utils';

/**
 * Creates an arrow entity with proper trajectory calculations.
 * The arrow will lead the target based on target velocity and flight time.
 */
export function createArrow(
  state: Entities,
  shooterPos: Vector2D,
  targetPos: Vector2D,
  targetVelocity: Vector2D,
  mapDimensions: { width: number; height: number },
  shooterId: EntityId,
  targetId?: EntityId,
): ArrowEntity {
  // Calculate distance to target
  const dirVector = getDirectionVectorOnTorus(
    shooterPos,
    targetPos,
    mapDimensions.width,
    mapDimensions.height,
  );
  const distance = vectorLength(dirVector);

  // Calculate flight time based on distance and speed
  const flightTime = distance / ARROW_SPEED;

  // Predict where target will be when arrow arrives (lead the target)
  const predictedPos = predictTargetPosition(
    targetPos,
    targetVelocity,
    flightTime,
    mapDimensions,
  );

  // Calculate trajectory to reach predicted position
  const trajectory = calculateArrowTrajectory(
    shooterPos,
    predictedPos,
    flightTime,
    mapDimensions,
  );

  const arrow: ArrowEntity = {
    id: state.nextEntityId++,
    type: 'arrow',
    position: { ...shooterPos },
    radius: ARROW_COLLISION_RADIUS,
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    velocity: { x: 0, y: 0 },
    debuffs: [],
    vx: trajectory.vx,
    vy: trajectory.vy,
    vz: trajectory.vz,
    shooterId,
    targetId,
    damage: ARROW_BASE_DAMAGE,
    age: 0,
    isEmbedded: false,
  };

  state.entities[arrow.id] = arrow;
  return arrow;
}

/**
 * Calculate velocity needed to reach target in given flight time.
 */
export function calculateArrowTrajectory(
  from: Vector2D,
  to: Vector2D,
  flightTime: number,
  mapDimensions: { width: number; height: number },
): { vx: number; vy: number; vz: number } {
  const dirVector = getDirectionVectorOnTorus(
    from,
    to,
    mapDimensions.width,
    mapDimensions.height,
  );

  // Avoid division by zero
  const safeFlightTime = Math.max(flightTime, ARROW_MIN_FLIGHT_TIME_SECONDS);

  return {
    vx: dirVector.x / safeFlightTime,
    vy: dirVector.y / safeFlightTime,
    vz: ARROW_INITIAL_HEIGHT,
  };
}

/**
 * Predict where target will be after flightTime, handling world wrapping.
 */
export function predictTargetPosition(
  targetPos: Vector2D,
  targetVel: Vector2D,
  flightTime: number,
  mapDimensions: { width: number; height: number },
): Vector2D {
  // Calculate predicted position
  let predictedX = targetPos.x + targetVel.x * flightTime;
  let predictedY = targetPos.y + targetVel.y * flightTime;

  // Handle world wrapping
  predictedX = ((predictedX % mapDimensions.width) + mapDimensions.width) % mapDimensions.width;
  predictedY = ((predictedY % mapDimensions.height) + mapDimensions.height) % mapDimensions.height;

  return { x: predictedX, y: predictedY };
}
