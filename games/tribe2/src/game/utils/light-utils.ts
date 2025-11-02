import { Vector3D } from '../types/rendering-types';

// Light animation period (full rotation in seconds)
const LIGHT_ROTATION_PERIOD = 60;

/**
 * Computes the light direction based on elapsed time.
 * The light rotates in a circular pattern around the scene.
 */
export function computeLightDirection(time: number): Vector3D {
  const angle = (time / LIGHT_ROTATION_PERIOD) * Math.PI * 2;
  const elevation = 0.6; // Keep light at a consistent elevation angle

  return {
    x: Math.cos(angle) * Math.cos(elevation),
    y: Math.sin(angle) * Math.cos(elevation),
    z: Math.sin(elevation),
  };
}
