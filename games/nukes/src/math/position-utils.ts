export function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt(Math.pow(bx - ax, 2) + Math.pow(by - ay, 2));
}
