// 3d-rendering.ts

interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Rotates a set of 3D points around the Y-axis.
 * @param points The array of 3D points to rotate.
 * @param angle The angle of rotation in radians.
 * @returns An array of rotated 3D points.
 */
export function rotate3D(points: Point3D[], angle: number): Point3D[] {
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  return points.map((point) => {
    const x = point.x * cosAngle - point.z * sinAngle;
    const z = point.x * sinAngle + point.z * cosAngle;

    return {
      x,
      y: point.y,
      z,
    };
  });
}

/**
 * Applies perspective projection to a 3D point.
 * @param point The 3D point to project.
 * @param distance The distance of the projection plane from the camera.
 * @returns A new Point3D with perspective applied.
 */
export function applyPerspective(point: Point3D, distance: number = 200): Point3D {
  const scale = distance / (distance + point.z);
  return {
    x: point.x * scale,
    y: point.y * scale,
    z: point.z,
  };
}
