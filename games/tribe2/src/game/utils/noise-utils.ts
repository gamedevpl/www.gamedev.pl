/*
 * A fast and simple 2D Perlin noise implementation.
 * This is a self-contained module with no external dependencies.
 * It's based on the original implementation by Ken Perlin.
 */

// The export of this file is a function that returns a noise function.
// This allows for creating multiple instances of the noise generator,
// potentially with different seeds in the future.
export function createNoise2D() {
  // Permutation table. This is a shuffled array of numbers from 0-255.
  const p = new Uint8Array(512);

  // Initialize the permutation table with a fixed seed for reproducibility.
  // In a real game, you might want to use a random seed.
  const random = (() => {
    let seed = 1;
    return () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };
  })();

  const permutation = Array.from({ length: 256 }, (_, i) => i);
  for (let i = permutation.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }

  // The permutation table is duplicated to avoid buffer overflows and modulo operations.
  for (let i = 0; i < 256; i++) {
    p[i] = p[i + 256] = permutation[i];
  }

  // The fade function as defined by Ken Perlin. It eases coordinate values
  // so that they will ease towards integral values, which makes the noise
  // look more natural.
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

  // Linear interpolation.
  const lerp = (t: number, a: number, b: number) => a + t * (b - a);

  // Calculates the dot product of a randomly selected gradient vector and the vector from
  // the input coordinate to the 8 corner points in 2D space.
  const grad = (hash: number, x: number, y: number) => {
    const h = hash & 15;
    // Convert low 4 bits of hash code into 12 gradient directions.
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };

  /**
   * The actual 2D noise function.
   * @param x The x-coordinate.
   * @param y The y-coordinate.
   * @returns A noise value between -1 and 1.
   */
  return (x: number, y: number): number => {
    // Find the unit cube that contains the point.
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    // Find the relative x, y coordinates of the point in the cube.
    x -= Math.floor(x);
    y -= Math.floor(y);

    // Compute the fade curves for each of x, y.
    const u = fade(x);
    const v = fade(y);

    // Hash coordinates of the 8 cube corners.
    const p1 = p[X] + Y;
    const p2 = p[X + 1] + Y;

    // And add blended results from 4 corners of the square.
    const n = lerp(
      v,
      lerp(u, grad(p[p1], x, y), grad(p[p2], x - 1, y)),
      lerp(u, grad(p[p1 + 1], x, y - 1), grad(p[p2 + 1], x - 1, y - 1)),
    );

    // The result is scaled to be between -1 and 1.
    return (n + 1) / 2;
  };
}
