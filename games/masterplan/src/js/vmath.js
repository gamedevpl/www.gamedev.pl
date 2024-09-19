// this is my library from warsztat-game-demo: https://github.com/gamedevpl/warsztat-game-demo/blob/master/lib/vmath.js
var VMath = { 
    EPSILON : Math.pow(2, -16),

    length : function(V) {
        return Math.sqrt(V[0] * V[0] + V[1] * V[1])
    },
    distanceSquared : function(A, B) {
        return Math.pow(A[0] - B[0], 2) + Math.pow(A[1] - B[1], 2);
    },
    distance : function(A, B) {
        return Math.sqrt(VMath.distanceSquared(A, B));
    },
    withinDistance : function(A, B, distance) {
        var dx = A[0] - B[0];
        var dy = A[1] - B[1];
        if (Math.abs(dx) > distance || Math.abs(dy) > distance) {
            return false;
        }
        
        var squared = Math.pow(dx, 2) + Math.pow(dy, 2);
        return Math.sqrt(squared) < distance;
    },
    normalize : function(A) {
        return VMath.scale(A, 1 / VMath.length(A));
    },

    angle : function(A, B) {
        return Math.atan2(VMath.perpDot(A, B), VMath.dot(A, B));
    },
    dot : function(A, B) {
        return A[0] * B[0] + A[1] * B[1];
    },
    perpDot : function(A, B) {
        return A[0] * B[1] - A[1] * B[0];
    },
    atan2 : function(A, B) {
        return Math.atan2(B[1] - A[1], B[0] - A[0]);
    },

    sub : function(A, B) {
        return [A[0] - B[0], A[1] - B[1]];
    },
    add : function(A, B) {
        return [A[0] + B[0], A[1] + B[1]];
    },
    scale : function(V, s) {
        return [V[0] * s, V[1] * s];
    },

    rotate : function(V, a) {
        var l = VMath.length(V);
        a = Math.atan2(V[1], V[0]) + a;
        return [Math.cos(a) * l, Math.sin(a) * l];
    },

    reflect : function(V, N) {
        return [0, 0];
    },

    project : function(V, N) {
        return [0, 0]
    },

    normal : function(A, B) {
        var AB = VMath.sub(B, A);
        AB = VMath.scale(AB, 1 / VMath.length(AB));
        return [[-AB[1], AB[0]], [AB[1], -AB[0]]];
    },

    // http://stackoverflow.com/a/565282
    // u = (q − p) × r / (r × s)
    // t = (q − p) × s / (r × s)
    // r x s = 0 => parallel
    // (q − p) × r = 0 => colinear
    intersectLineLine : function(Q, eQ, P, eP) {
        var S = VMath.sub(eQ, Q);
        var R = VMath.sub(eP, P);
        var RxS = VMath.perpDot(R, S);
        if (RxS == 0)
            return;
        var u = VMath.perpDot(VMath.sub(Q, P), R) / RxS;
        var t = VMath.perpDot(VMath.sub(Q, P), S) / RxS;
        if (u < 0 || t < 0 || u > 1 || t > 1)
            return;
        return [u, t]
    },

    // http://www.gamasutra.com/view/feature/131790/simple_intersection_tests_for_games.php?page=2
    // (B[u] - A[u]) x (B[u]-A[u]) = (Ra+Rb)^2
    // AB x AB + (2 * Vab x AB) * u + Vab x Vab * u^2 = (ra + rb)^2
    intersectSphereSphere : function(A, B, Va, Vb, Ra, Rb) {
        var AB = VMath.sub(B, A);
        var Vab = VMath.sub(Vb, Va);
        var Rab = Ra + Rb;
        var dotAB = VMath.dot(AB, AB);
        var sqrRab = Rab * Rab;

        var a = VMath.dot(Vab, Vab);

        if (a == 0)
            return;

        var b = 2 * VMath.dot(Vab, AB);

        var c = dotAB - sqrRab;

        if (dotAB <= sqrRab)
            return [0, 0];

        var d = b * b - 4 * a * c;

        if (d < 0)
            return;

        d = Math.sqrt(d);

        var T1 = (-b - d) / (2 * a)
        var T2 = (-b + d) / (2 * a);

        return T1 < T2 ? [T1, T2] : [T2, T1];
    },

    // P - circle center,
    // R - radius,
    // V - velocity
    // A, B - segment points
    intersectSphereLine : function(P, V, R, A, B) {
        var AB = VMath.sub(B, A);
        var ivdotAB = R / Math.sqrt(VMath.dot(AB, AB));
        var N1 = VMath.scale([-AB[1], AB[0]], ivdotAB);
        var N2 = VMath.scale([AB[1], -AB[0]], ivdotAB);      
        N1 = VMath.add(P, N1);
        N2 = VMath.add(P, N2);

        var T = [VMath.intersectLineLine(N1, VMath.add(N1, V), A, B), VMath.intersectLineLine(N2, VMath.add(N2, V), A, B)];

        if (!T[0] || !T[1])
            return T[0] || T[1];

        if (!T[0] && !T[1])
            return;

        if (T[0][0] < T[1][0])
            T = T[0];
        else
            T = T[1];

        if (T[0][0] < 0 || T[1] < 0)
            return;

        if (T[0] <= 1 && T[1] <= 1)
            return T;
    }

};