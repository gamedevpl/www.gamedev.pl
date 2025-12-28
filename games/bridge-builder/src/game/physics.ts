import planck from 'planck';
import { LEVEL, MATERIALS, MaterialType } from './constants';
import { Node, Beam } from './types';

const Vec2 = planck.Vec2;

export interface SimBeam {
  id: string;
  mat: MaterialType;
  kind: 'distance' | 'road';
  joint?: planck.DistanceJoint;
  joints?: planck.Joint[];
  plankBody?: planck.Body;
  broken: boolean;
  breakForce: number;
}

export interface Train {
  cars: planck.Body[];
  wheels: planck.Body[];
  joints: planck.Joint[];
}

export interface WorldSimulation {
  world: planck.World;
  nodeBodies: Map<string, planck.Body>;
  simBeams: SimBeam[];
  train: Train;
  t: number;
  acc: number;
  outcome: '' | 'win' | 'fail';
}

/**
 * Build the physics world from the current design
 */
export function buildWorldFromDesign(nodes: Node[], beams: Beam[]): WorldSimulation {
  const world = new planck.World({ gravity: Vec2(0, -10) });

  // Ground/cliffs
  const ground = world.createBody();
  const y = LEVEL.platformY;

  // Left platform
  ground.createFixture(planck.Edge(Vec2(LEVEL.worldMinX, y), Vec2(LEVEL.gapStart, y)), {
    friction: 0.9,
  });
  // Right platform
  ground.createFixture(planck.Edge(Vec2(LEVEL.gapEnd, y), Vec2(LEVEL.worldMaxX, y)), {
    friction: 0.9,
  });

  // Fill the gap below with a "void" floor, far lower
  ground.createFixture(planck.Edge(Vec2(LEVEL.gapStart, LEVEL.floorY), Vec2(LEVEL.gapEnd, LEVEL.floorY)), {
    friction: 0.2,
  });

  // Cliff faces
  ground.createFixture(planck.Edge(Vec2(LEVEL.gapStart, y), Vec2(LEVEL.gapStart, LEVEL.floorY)), { friction: 0.6 });
  ground.createFixture(planck.Edge(Vec2(LEVEL.gapEnd, y), Vec2(LEVEL.gapEnd, LEVEL.floorY)), { friction: 0.6 });

  // Node bodies
  const nodeBodies = new Map<string, planck.Body>();
  for (const n of nodes) {
    const body = world.createBody({
      type: n.anchor ? 'static' : 'dynamic',
      position: Vec2(n.x, n.y),
      linearDamping: 0.05,
      angularDamping: 0.05,
    });
    body.createFixture(planck.Circle(0.08), {
      density: n.anchor ? 0 : 2.2,
      friction: 0.5,
      restitution: 0.1,
    });
    nodeBodies.set(n.id, body);
  }

  // Beam joints + optional road planks
  const simBeams: SimBeam[] = [];

  const addDistanceBeam = (b: Beam) => {
    const A = nodeBodies.get(b.a);
    const B = nodeBodies.get(b.b);
    if (!A || !B) return;
    const pA = A.getPosition();
    const pB = B.getPosition();
    const L = planck.Vec2.distance(pA, pB);
    const m = MATERIALS[b.mat];
    const joint = world.createJoint(
      planck.DistanceJoint(
        {
          frequencyHz: m.jointHz,
          dampingRatio: m.damping,
          collideConnected: false,
          length: L,
        },
        A,
        B,
        pA,
        pB,
      ),
    );
    simBeams.push({
      id: b.id,
      mat: b.mat,
      kind: 'distance',
      joint: joint as planck.DistanceJoint,
      broken: false,
      breakForce: m.breakPerM * L,
    });
  };

  const addRoadBeam = (b: Beam) => {
    const A = nodeBodies.get(b.a);
    const B = nodeBodies.get(b.b);
    if (!A || !B) return;
    const pA = A.getPosition();
    const pB = B.getPosition();
    const delta = Vec2(pB.x - pA.x, pB.y - pA.y);
    const L = Math.max(0.35, Math.hypot(delta.x, delta.y));
    const ang = Math.atan2(delta.y, delta.x);
    const mid = Vec2((pA.x + pB.x) / 2, (pA.y + pB.y) / 2);

    const plank = world.createBody({
      type: 'dynamic',
      position: mid,
      angle: ang,
      linearDamping: 0.02,
      angularDamping: 0.08,
    });

    // Thin plank fixture
    plank.createFixture(planck.Box(L / 2, 0.06), {
      density: 1.2,
      friction: 0.95,
      restitution: 0.0,
    });

    const m = MATERIALS[b.mat];
    // Soft joints to keep plank endpoints attached to nodes
    const j1 = world.createJoint(
      planck.WeldJoint(
        {
          frequencyHz: m.jointHz,
          dampingRatio: m.damping,
          collideConnected: false,
        },
        plank,
        A,
        Vec2(pA.x, pA.y),
      ),
    );
    const j2 = world.createJoint(
      planck.WeldJoint(
        {
          frequencyHz: m.jointHz,
          dampingRatio: m.damping,
          collideConnected: false,
        },
        plank,
        B,
        Vec2(pB.x, pB.y),
      ),
    );

    // Add a subtle stabilizing distance joint between nodes too
    const stab = world.createJoint(
      planck.DistanceJoint(
        {
          frequencyHz: m.jointHz * 0.7,
          dampingRatio: m.damping,
          collideConnected: false,
          length: L,
        },
        A,
        B,
        pA,
        pB,
      ),
    );

    simBeams.push({
      id: b.id,
      mat: b.mat,
      kind: 'road',
      plankBody: plank,
      joints: [j1!, j2!, stab!],
      broken: false,
      breakForce: m.breakPerM * L,
    });
  };

  for (const b of beams) {
    if (b.mat === 'road') addRoadBeam(b);
    else addDistanceBeam(b);
  }

  // Train builder
  const train: Train = { cars: [], wheels: [], joints: [] };

  function addCar(x: number, y: number, motor = false): planck.Body {
    const chassis = world.createBody({
      type: 'dynamic',
      position: Vec2(x, y),
      angularDamping: 0.8,
      linearDamping: 0.05,
    });
    chassis.createFixture(planck.Box(0.9, 0.22), {
      density: 2.2,
      friction: 0.6,
    });

    const w1 = world.createBody({ type: 'dynamic', position: Vec2(x - 0.55, y - 0.28) });
    const w2 = world.createBody({ type: 'dynamic', position: Vec2(x + 0.55, y - 0.28) });
    w1.createFixture(planck.Circle(0.22), { density: 1.6, friction: 1.2, restitution: 0.0 });
    w2.createFixture(planck.Circle(0.22), { density: 1.6, friction: 1.2, restitution: 0.0 });

    const j1 = world.createJoint(
      planck.WheelJoint(
        {
          motorSpeed: motor ? -7.8 : 0,
          maxMotorTorque: motor ? 85 : 0,
          enableMotor: motor,
          frequencyHz: 5.5,
          dampingRatio: 0.7,
        },
        chassis,
        w1,
        w1.getPosition(),
        Vec2(0, 1),
      ),
    );
    const j2 = world.createJoint(
      planck.WheelJoint(
        {
          motorSpeed: motor ? -7.8 : 0,
          maxMotorTorque: motor ? 85 : 0,
          enableMotor: motor,
          frequencyHz: 5.5,
          dampingRatio: 0.7,
        },
        chassis,
        w2,
        w2.getPosition(),
        Vec2(0, 1),
      ),
    );

    train.cars.push(chassis);
    train.wheels.push(w1, w2);
    train.joints.push(j1!, j2!);
    return chassis;
  }

  const startX = LEVEL.gapStart - 4.4;
  const startY = LEVEL.platformY + 0.9;
  const loco = addCar(startX, startY, true);
  const car1 = addCar(startX - 2.2, startY, false);
  const car2 = addCar(startX - 4.4, startY, false);

  // Couplers
  train.joints.push(
    world.createJoint(
      planck.DistanceJoint(
        { frequencyHz: 2.8, dampingRatio: 0.8, length: 2.0, collideConnected: false },
        loco,
        car1,
        loco.getWorldPoint(Vec2(-0.9, 0)),
        car1.getWorldPoint(Vec2(0.9, 0)),
      ),
    )!,
  );
  train.joints.push(
    world.createJoint(
      planck.DistanceJoint(
        { frequencyHz: 2.8, dampingRatio: 0.8, length: 2.0, collideConnected: false },
        car1,
        car2,
        car1.getWorldPoint(Vec2(-0.9, 0)),
        car2.getWorldPoint(Vec2(0.9, 0)),
      ),
    )!,
  );

  return { world, nodeBodies, simBeams, train, t: 0, acc: 0, outcome: '' };
}

/**
 * Step the physics simulation
 */
export function stepSimulation(sim: WorldSimulation, realDt: number): WorldSimulation {
  const dt = 1 / 60;
  sim.acc = (sim.acc || 0) + realDt;

  let steps = 0;
  while (sim.acc >= dt && steps < 6) {
    sim.world.step(dt);
    sim.acc -= dt;
    sim.t += dt;
    steps++;

    // Beam breaking
    const invDt = 1 / dt;
    for (const sb of sim.simBeams) {
      if (sb.broken) continue;
      const joints = sb.kind === 'road' ? sb.joints! : [sb.joint!];
      let maxF = 0;
      for (const j of joints) {
        const rf = j.getReactionForce(invDt);
        const mag = Math.hypot(rf.x, rf.y);
        if (mag > maxF) maxF = mag;
      }
      if (maxF > sb.breakForce) {
        // break!
        for (const j of joints) sim.world.destroyJoint(j);
        sb.broken = true;
      }
    }

    // Outcome checks
    const cars = sim.train.cars;
    const minY = -0.8;
    let crashed = false;
    for (const c of cars) {
      const p = c.getPosition();
      if (p.y < minY) crashed = true;
    }
    const tailX = cars[cars.length - 1].getPosition().x;

    if (!sim.outcome) {
      if (crashed) sim.outcome = 'fail';
      if (tailX > LEVEL.gapEnd + 2.0 && !crashed) sim.outcome = 'win';
      if (sim.t > 18 && !crashed) sim.outcome = 'fail';
    }

    if (sim.outcome) {
      // stop motors if done
      for (const j of sim.train.joints) {
        const wheelJoint = j as planck.WheelJoint;
        if (wheelJoint.setMotorSpeed) wheelJoint.setMotorSpeed(0);
        if (wheelJoint.enableMotor) wheelJoint.enableMotor(false);
      }
    }
  }

  return sim;
}
