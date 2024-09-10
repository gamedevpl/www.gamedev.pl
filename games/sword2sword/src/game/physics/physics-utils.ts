import * as planck from 'planck';
import { World, Body } from './physics-types';

/**
 * Creates a body part with the given shape and options.
 * @param world The planck World instance
 * @param shape The shape of the body part
 * @param options Body definition options
 * @returns The created Body
 */
export function createBodyPart(
  world: World,
  shape: planck.Shape,
  bodyOptions: planck.BodyDef,
  fixtureOptions: Pick<planck.FixtureDef, 'density' | 'friction' | 'restitution'> = {},
): Body {
  const body = world.createBody(bodyOptions);
  body.createFixture({
    shape,
    density: bodyOptions.type === 'dynamic' ? fixtureOptions.density || 1 : 0,
    friction: fixtureOptions.friction || 0.3,
    restitution: fixtureOptions.restitution || 0.2,
  });
  return body;
}

/**
 * Creates a revolute joint between two bodies.
 * @param world The planck World instance
 * @param bodyA The first body to attach
 * @param bodyB The second body to attach
 * @param anchor The anchor point in world coordinates
 * @param lowerAngle The lower angle limit
 * @param upperAngle The upper angle limit
 * @returns The created RevoluteJoint
 */
export function createRevoluteJoint(
  world: World,
  bodyA: Body,
  bodyB: Body,
  anchor: planck.Vec2,
  lowerAngle: number,
  upperAngle: number,
): planck.RevoluteJoint {
  return world.createJoint(
    planck.RevoluteJoint(
      {
        lowerAngle,
        upperAngle,
        enableLimit: true,
      },
      bodyA,
      bodyB,
      anchor,
    ),
  )!;
}

/**
 * Converts degrees to radians.
 * @param degrees The angle in degrees
 * @returns The angle in radians
 */
export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Converts radians to degrees.
 * @param radians The angle in radians
 * @returns The angle in degrees
 */
export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Calculates the distance between two points.
 * @param point1 The first point
 * @param point2 The second point
 * @returns The distance between the two points
 */
export function calculateDistance(point1: planck.Vec2, point2: planck.Vec2): number {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the angle between two points.
 * @param point1 The first point
 * @param point2 The second point
 * @returns The angle in radians
 */
export function calculateAngle(point1: planck.Vec2, point2: planck.Vec2): number {
  return Math.atan2(point2.y - point1.y, point2.x - point1.x);
}

/**
 * Applies a force to a body in a given direction.
 * @param body The body to apply the force to
 * @param force The magnitude of the force
 * @param angle The angle of the force in radians
 */
export function applyForceAtAngle(body: Body, force: number, angle: number): void {
  const forceVector = planck.Vec2(Math.cos(angle) * force, Math.sin(angle) * force);
  body.applyForceToCenter(forceVector);
}
