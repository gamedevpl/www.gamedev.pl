export type Vec = [number, number];

export const VMath = {
  EPSILON: Math.pow(2, -16),

  length: function (V: Vec) {
    return Math.sqrt(V[0] * V[0] + V[1] * V[1]);
  },
  distanceSquared: function (A: Vec, B: Vec) {
    return Math.pow(A[0] - B[0], 2) + Math.pow(A[1] - B[1], 2);
  },
  distance: function (A: Vec, B: Vec) {
    return Math.sqrt(this.distanceSquared(A, B));
  },
  withinDistance: function (A: Vec, B: Vec, distance: number) {
    const dx = A[0] - B[0];
    const dy = A[1] - B[1];
    if (Math.abs(dx) > distance || Math.abs(dy) > distance) {
      return false;
    }

    const squared = Math.pow(dx, 2) + Math.pow(dy, 2);
    return Math.sqrt(squared) < distance;
  },
  normalize: function (A: Vec) {
    return this.scale(A, 1 / this.length(A));
  },

  angle: function (A: Vec, B: Vec) {
    return Math.atan2(this.perpDot(A, B), this.dot(A, B));
  },
  dot: function (A: Vec, B: Vec) {
    return A[0] * B[0] + A[1] * B[1];
  },
  perpDot: function (A: Vec, B: Vec) {
    return A[0] * B[1] - A[1] * B[0];
  },
  /**
   *
   * @param {[number, number]} A
   * @param {[number, number]} B
   * @returns {number}
   */
  atan2: function (A: Vec, B: Vec) {
    return Math.atan2(B[1] - A[1], B[0] - A[0]);
  },
  /**
   *
   * @param {[number, number]} A
   * @param {[number, number]} B
   * @returns {[number, number]}
   */
  sub: function (A: Vec, B: Vec): Vec {
    return [A[0] - B[0], A[1] - B[1]];
  },
  /**
   *
   * @param {[number, number]} A
   * @param {[number, number]} B
   * @returns {[number, number]}
   */
  add: function (A: Vec, B: Vec): Vec {
    return [A[0] + B[0], A[1] + B[1]];
  },
  /**
   *
   * @param {[number, number]} V
   * @param {number} s
   * @returns {[number, number]}
   */
  scale: function (V: Vec, s: number): Vec {
    return [V[0] * s, V[1] * s];
  },

  /**
   *
   * @param {[number, number]} V
   * @param {number} a
   * @returns {[number, number]}
   */
  rotate: function (V: Vec, a: number): Vec {
    const l = this.length(V);
    a = Math.atan2(V[1], V[0]) + a;
    return [Math.cos(a) * l, Math.sin(a) * l];
  },

  reflect: function () {
    return [0, 0];
  },

  project: function () {
    return [0, 0];
  },

  normal: function (A: Vec, B: Vec) {
    let AB = this.sub(B, A);
    AB = this.scale(AB, 1 / this.length(AB));
    return [
      [-AB[1], AB[0]],
      [AB[1], -AB[0]],
    ];
  },

  // http://stackoverflow.com/a/565282
  // u = (q − p) × r / (r × s)
  // t = (q − p) × s / (r × s)
  // r x s = 0 => parallel
  // (q − p) × r = 0 => colinear
  intersectLineLine: function (Q: Vec, eQ: Vec, P: Vec, eP: Vec): Vec | undefined {
    const S = this.sub(eQ, Q);
    const R = this.sub(eP, P);
    const RxS = this.perpDot(R, S);
    if (RxS == 0) return;
    const u = this.perpDot(this.sub(Q, P), R) / RxS;
    const t = this.perpDot(this.sub(Q, P), S) / RxS;
    if (u < 0 || t < 0 || u > 1 || t > 1) return;
    return [u, t];
  },

  // http://www.gamasutra.com/view/feature/131790/simple_intersection_tests_for_games.php?page=2
  // (B[u] - A[u]) x (B[u]-A[u]) = (Ra+Rb)^2
  // AB x AB + (2 * Vab x AB) * u + Vab x Vab * u^2 = (ra + rb)^2
  intersectSphereSphere: function (A: Vec, B: Vec, Va: Vec, Vb: Vec, Ra: number, Rb: number) {
    const AB = this.sub(B, A);
    const Vab = this.sub(Vb, Va);
    const Rab = Ra + Rb;
    const dotAB = this.dot(AB, AB);
    const sqrRab = Rab * Rab;

    const a = this.dot(Vab, Vab);

    if (a == 0) return;

    const b = 2 * this.dot(Vab, AB);

    const c = dotAB - sqrRab;

    if (dotAB <= sqrRab) return [0, 0];

    let d = b * b - 4 * a * c;

    if (d < 0) return;

    d = Math.sqrt(d);

    const T1 = (-b - d) / (2 * a);
    const T2 = (-b + d) / (2 * a);

    return T1 < T2 ? [T1, T2] : [T2, T1];
  },

  // P - circle center,
  // R - radius,
  // V - velocity
  // A: Vec, B: Vec - segment points
  intersectSphereLine: function (P: Vec, V: Vec, R: number, A: Vec, B: Vec) {
    const AB = this.sub(B, A);
    const ivdotAB = R / Math.sqrt(this.dot(AB, AB));
    let N1 = this.scale([-AB[1], AB[0]], ivdotAB);
    let N2 = this.scale([AB[1], -AB[0]], ivdotAB);
    N1 = this.add(P, N1);
    N2 = this.add(P, N2);

    let T: [Vec | undefined, Vec | undefined] = [
      this.intersectLineLine(N1, this.add(N1, V), A, B),
      this.intersectLineLine(N2, this.add(N2, V), A, B),
    ];

    if (!T[0] || !T[1]) return T[0] || T[1];

    if (!T[0] && !T[1]) return;

    // @ts-expect-error: it works
    if (T[0][0] < T[1][0]) T = T[0];
    // @ts-expect-error: it works
    else T = T[1];

    // @ts-expect-error: it works
    if (T[0][0] < 0 || T[1] < 0) return;

    // @ts-expect-error: it works
    if (T[0] <= 1 && T[1] <= 1) return T;
  },
};
