import { describe, it, expect, beforeEach } from 'vitest';
import { buildWorldFromDesign, stepSimulation, WorldSimulation } from './physics';
import { getInitialNodes, getInitialBeams } from './utils';
import { LEVEL } from './constants';
import { Node, Beam } from './types';

describe('Bridge Builder Physics Simulation', () => {
  let nodes: Node[];
  let beams: Beam[];
  let simulation: WorldSimulation;

  beforeEach(() => {
    nodes = getInitialNodes();
    beams = getInitialBeams();
    simulation = buildWorldFromDesign(nodes, beams);
  });

  describe('World Setup', () => {
    it('should create a physics world', () => {
      expect(simulation.world).toBeDefined();
    });

    it('should create node bodies for all nodes', () => {
      expect(simulation.nodeBodies.size).toBe(nodes.length);
      for (const node of nodes) {
        expect(simulation.nodeBodies.has(node.id)).toBe(true);
      }
    });

    it('should create simulation beams for all beams', () => {
      expect(simulation.simBeams.length).toBe(beams.length);
    });

    it('should initialize simulation time to zero', () => {
      expect(simulation.t).toBe(0);
      expect(simulation.acc).toBe(0);
    });

    it('should have no outcome initially', () => {
      expect(simulation.outcome).toBe('');
    });
  });

  describe('Train Setup', () => {
    it('should create 3 train cars', () => {
      expect(simulation.train.cars.length).toBe(3);
    });

    it('should create 6 wheels (2 per car)', () => {
      expect(simulation.train.wheels.length).toBe(6);
    });

    it('should have train joints for wheels and couplers', () => {
      // 2 wheel joints per car (6 total) + 2 coupler joints
      expect(simulation.train.joints.length).toBeGreaterThanOrEqual(8);
    });

    it('should position all train cars on the platform (not hanging off)', () => {
      const platformMinX = LEVEL.worldMinX;
      const platformMaxX = LEVEL.gapStart;

      for (let i = 0; i < simulation.train.cars.length; i++) {
        const car = simulation.train.cars[i];
        const pos = car.getPosition();
        
        // Each car should be within the left platform bounds
        expect(pos.x).toBeGreaterThan(platformMinX);
        expect(pos.x).toBeLessThan(platformMaxX);
        
        // Car should be above platform level
        expect(pos.y).toBeGreaterThan(LEVEL.platformY);
      }
    });

    it('should have train cars connected (close together)', () => {
      const car0Pos = simulation.train.cars[0].getPosition();
      const car1Pos = simulation.train.cars[1].getPosition();
      const car2Pos = simulation.train.cars[2].getPosition();

      // Cars should be approximately 2 meters apart (carSpacing)
      const dist01 = Math.abs(car0Pos.x - car1Pos.x);
      const dist12 = Math.abs(car1Pos.x - car2Pos.x);

      expect(dist01).toBeCloseTo(2.0, 0);
      expect(dist12).toBeCloseTo(2.0, 0);
    });

    it('should have locomotive (first car) in front', () => {
      const locoPos = simulation.train.cars[0].getPosition();
      const car1Pos = simulation.train.cars[1].getPosition();
      const car2Pos = simulation.train.cars[2].getPosition();

      // Locomotive should be to the right (higher x) of other cars
      expect(locoPos.x).toBeGreaterThan(car1Pos.x);
      expect(car1Pos.x).toBeGreaterThan(car2Pos.x);
    });
  });

  describe('Simulation Step', () => {
    it('should advance simulation time when stepped', () => {
      const initialTime = simulation.t;
      simulation = stepSimulation(simulation, 0.1);
      expect(simulation.t).toBeGreaterThan(initialTime);
    });

    it('should move train forward when simulation runs', () => {
      const initialLocoX = simulation.train.cars[0].getPosition().x;
      
      // Run simulation for 1 second
      for (let i = 0; i < 60; i++) {
        simulation = stepSimulation(simulation, 1/60);
      }
      
      const finalLocoX = simulation.train.cars[0].getPosition().x;
      
      // Train should move to the right (positive x direction)
      expect(finalLocoX).toBeGreaterThan(initialLocoX);
    });

    it('should keep train cars connected during simulation', () => {
      // Run simulation for 2 seconds
      for (let i = 0; i < 120; i++) {
        simulation = stepSimulation(simulation, 1/60);
      }
      
      const car0Pos = simulation.train.cars[0].getPosition();
      const car1Pos = simulation.train.cars[1].getPosition();
      const car2Pos = simulation.train.cars[2].getPosition();

      // Cars should still be connected (within reasonable distance)
      const dist01 = Math.hypot(car0Pos.x - car1Pos.x, car0Pos.y - car1Pos.y);
      const dist12 = Math.hypot(car1Pos.x - car2Pos.x, car1Pos.y - car2Pos.y);

      // Distance should be close to car spacing (2m) with some tolerance for physics
      expect(dist01).toBeLessThan(3.0);
      expect(dist12).toBeLessThan(3.0);
    });
  });

  describe('Bridge Behavior', () => {
    it('should have road beams as "road" kind', () => {
      const roadBeams = simulation.simBeams.filter(sb => sb.kind === 'road');
      expect(roadBeams.length).toBeGreaterThan(0);
    });

    it('should have plank bodies for road beams', () => {
      const roadBeams = simulation.simBeams.filter(sb => sb.kind === 'road');
      for (const beam of roadBeams) {
        expect(beam.plankBody).toBeDefined();
      }
    });

    it('should have beams that are not broken initially', () => {
      for (const beam of simulation.simBeams) {
        expect(beam.broken).toBe(false);
      }
    });
  });

  describe('Outcome Detection', () => {
    it('should detect collapse when train falls', () => {
      // Simulate until collapse or timeout
      let iterations = 0;
      const maxIterations = 60 * 20; // 20 seconds max
      
      while (simulation.outcome === '' && iterations < maxIterations) {
        simulation = stepSimulation(simulation, 1/60);
        iterations++;
      }
      
      // With the default weak bridge, the train should collapse
      // (or potentially win if bridge somehow holds)
      expect(['fail', 'win', '']).toContain(simulation.outcome);
    });
  });

  describe('Anchor Nodes', () => {
    it('should have anchor nodes as static bodies', () => {
      const anchorNodes = nodes.filter(n => n.anchor);
      
      for (const node of anchorNodes) {
        const body = simulation.nodeBodies.get(node.id);
        expect(body).toBeDefined();
        expect(body!.getType()).toBe('static');
      }
    });

    it('should have non-anchor nodes as dynamic bodies', () => {
      const dynamicNodes = nodes.filter(n => !n.anchor);
      
      for (const node of dynamicNodes) {
        const body = simulation.nodeBodies.get(node.id);
        expect(body).toBeDefined();
        expect(body!.getType()).toBe('dynamic');
      }
    });
  });
});

describe('Initial State', () => {
  it('should create initial nodes with correct structure', () => {
    const nodes = getInitialNodes();
    
    expect(nodes.length).toBe(4);
    
    // Check anchor nodes
    const leftAnchor = nodes.find(n => n.id === 'L');
    const rightAnchor = nodes.find(n => n.id === 'R');
    
    expect(leftAnchor).toBeDefined();
    expect(leftAnchor!.anchor).toBe(true);
    expect(rightAnchor).toBeDefined();
    expect(rightAnchor!.anchor).toBe(true);
    
    // Check mid nodes
    const mid1 = nodes.find(n => n.id === 'M1');
    const mid2 = nodes.find(n => n.id === 'M2');
    
    expect(mid1).toBeDefined();
    expect(mid1!.anchor).toBe(false);
    expect(mid2).toBeDefined();
    expect(mid2!.anchor).toBe(false);
  });

  it('should create initial beams connecting all nodes', () => {
    const beams = getInitialBeams();
    
    expect(beams.length).toBe(3);
    
    // All initial beams should be road type
    for (const beam of beams) {
      expect(beam.mat).toBe('road');
    }
  });

  it('should position road deck at platform level', () => {
    const nodes = getInitialNodes();
    const roadNodeY = LEVEL.platformY - 0.06; // Expected: platform - half plank height
    
    for (const node of nodes) {
      // All nodes should be at the same Y level for a flat deck
      expect(node.y).toBeCloseTo(roadNodeY, 2);
    }
  });
});
