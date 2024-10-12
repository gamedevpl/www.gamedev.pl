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

/**
 * Translates a set of 3D points.
 * @param points The array of 3D points to translate.
 * @param tx The translation in the x direction.
 * @param ty The translation in the y direction.
 * @param tz The translation in the z direction.
 * @returns An array of translated 3D points.
 */
export function translate3D(points: Point3D[], tx: number, ty: number, tz: number): Point3D[] {
  return points.map((point) => ({
    x: point.x + tx,
    y: point.y + ty,
    z: point.z + tz,
  }));
}

/**
 * Scales a set of 3D points.
 * @param points The array of 3D points to scale.
 * @param sx The scale factor in the x direction.
 * @param sy The scale factor in the y direction.
 * @param sz The scale factor in the z direction.
 * @returns An array of scaled 3D points.
 */
export function scale3D(points: Point3D[], sx: number, sy: number, sz: number): Point3D[] {
  return points.map((point) => ({
    x: point.x * sx,
    y: point.y * sy,
    z: point.z * sz,
  }));
}

/**
 * Applies a series of transformations to a set of 3D points.
 * @param points The array of 3D points to transform.
 * @param transforms An array of transformation functions to apply in order.
 * @returns An array of transformed 3D points.
 */
export function applyTransforms(points: Point3D[], transforms: ((points: Point3D[]) => Point3D[])[]): Point3D[] {
  return transforms.reduce((transformedPoints, transform) => transform(transformedPoints), points);
}