export function createSimplexNoise() {
  const gradients = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const permutation = Array.from({ length: 256 }, (_, i) => i).sort(() => Math.random() - 0.5);
  const perm = [...permutation, ...permutation];

  function dot(g: number[], x: number, y: number) {
    return g[0] * x + g[1] * y;
  }

  return function noise(x: number, y: number) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = x * x * x * (x * (x * 6 - 15) + 10);
    const v = y * y * y * (y * (y * 6 - 15) + 10);
    const A = perm[X] + Y;
    const B = perm[X + 1] + Y;
    return (
      (1 +
        (dot(gradients[perm[A] & 7], x, y) * (1 - u) + dot(gradients[perm[B] & 7], x - 1, y) * u) * (1 - v) +
        (dot(gradients[perm[A + 1] & 7], x, y - 1) * (1 - u) + dot(gradients[perm[B + 1] & 7], x - 1, y - 1) * u) * v) /
      2
    );
  };
}
